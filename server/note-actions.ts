"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { getClient, ownsClient } from "@/lib/clients/queries";
import { db } from "@/lib/db";
import { parseIsoDate, toIsoDate, zonedMidnight } from "@/lib/dates";
import { EMPTY_DOC, isDocJson, type DocJson } from "@/lib/notes/content";
import { canEditContent, lockedFieldIn, type NoteStatusValue } from "@/lib/notes/finalise";
import { clean, parseKeyFigures, type KeyFigures } from "@/lib/notes/key-figures";
import type { LoanStageValue, NoteTypeValue } from "@/lib/notes/taxonomy";
import { noteFromTemplate } from "@/lib/notes/templates";
import {
  amendmentSchema,
  noteIdSchema,
  noteTemplateSchema,
  updateNoteMetaSchema,
  updateNoteSchema,
  type UpdateNoteInput,
  type UpdateNoteMetaInput,
} from "@/lib/notes/validation";
import { jsonEqual, shouldSnapshot } from "@/lib/notes/versioning";

type Fail = { ok: false; error: string };

export type SaveNoteResult = { ok: true; updatedAt: string } | Fail;

/** Serialisable note details, as returned to the client after an update. */
export type NoteMetaDto = {
  noteType: NoteTypeValue;
  loanStage: LoanStageValue | null;
  tags: string[];
  followUpDate: string | null; // "YYYY-MM-DD" in the broker's time zone
  pinned: boolean;
  clientId: string | null;
  clientName: string | null;
  keyFigures: KeyFigures;
  status: NoteStatusValue;
};

export type SaveNoteMetaResult = { ok: true; meta: NoteMetaDto } | Fail;

const FINALISED_MESSAGE = "This note is finalised. Add an amendment instead of editing it.";

function revalidateNote(id: string) {
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  revalidatePath("/clients", "layout");
}

async function readMeta(userId: string, id: string): Promise<NoteMetaDto> {
  const note = await db.note.findFirstOrThrow({
    where: { id, userId },
    select: {
      noteType: true,
      loanStage: true,
      tags: true,
      followUpAt: true,
      pinned: true,
      status: true,
      keyFigures: true,
      client: { select: { id: true, name: true } },
    },
  });
  return {
    noteType: note.noteType,
    loanStage: note.loanStage,
    tags: note.tags,
    followUpDate: note.followUpAt ? toIsoDate(note.followUpAt) : null,
    pinned: note.pinned,
    clientId: note.client?.id ?? null,
    clientName: note.client?.name ?? null,
    keyFigures: parseKeyFigures(note.keyFigures),
    status: note.status,
  };
}

/**
 * Updates a note's details. Only the given fields change. On finalised notes only workflow
 * fields (follow-up, stage, tags, pin) may change — the server enforces this, not just the UI.
 */
export async function updateNoteMetaAction(
  input: UpdateNoteMetaInput,
): Promise<SaveNoteMetaResult> {
  const user = await requireUser();
  const parsed = updateNoteMetaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { id, followUpDate, keyFigures, clientId, ...rest } = parsed.data;

  const current = await db.note.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { status: true },
  });
  if (!current) return { ok: false, error: "Note not found" };

  const locked = lockedFieldIn(
    current.status,
    Object.keys(parsed.data).filter(
      (k) => k !== "id" && parsed.data[k as keyof typeof parsed.data] !== undefined,
    ),
  );
  if (locked) return { ok: false, error: FINALISED_MESSAGE };

  if (clientId && !(await ownsClient(user.id, clientId))) {
    return { ok: false, error: "Client not found" };
  }

  const data: Record<string, unknown> = { ...rest };
  if (followUpDate !== undefined) {
    const ymd = followUpDate === null ? null : parseIsoDate(followUpDate);
    data.followUpAt = ymd ? zonedMidnight(ymd) : null;
  }
  if (clientId !== undefined) data.clientId = clientId;
  if (keyFigures !== undefined) {
    const cleaned = keyFigures ? clean(keyFigures) : {};
    data.keyFigures = Object.keys(cleaned).length ? cleaned : null;
  }

  await db.note.updateMany({ where: { id, userId: user.id, deletedAt: null }, data });
  revalidateNote(id);
  return { ok: true, meta: await readMeta(user.id, id) };
}

/** Creates a note (optionally from a template and for a client) and opens it in the editor. */
export async function createNoteAction(formData: FormData): Promise<never> {
  const user = await requireUser();
  const { templateId, clientId } = noteTemplateSchema.parse({
    templateId: formData.get("templateId") ?? undefined,
    clientId: formData.get("clientId") || undefined,
  });
  const client = clientId ? await getClient(user.id, clientId) : null;
  const { contentJson, noteType, title } = noteFromTemplate(templateId, client?.name);

  const note = await db.note.create({
    data: {
      userId: user.id,
      title,
      contentJson,
      noteType,
      clientId: client?.id ?? null,
      versions: { create: { title, contentJson } },
    },
    select: { id: true },
  });
  revalidateNote(note.id);
  redirect(`/notes/${note.id}`);
}

/** Autosave target. Ownership is enforced in the WHERE clause, never trusted from the client. */
export async function saveNoteAction(input: UpdateNoteInput): Promise<SaveNoteResult> {
  const user = await requireUser();
  const parsed = updateNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note" };
  }
  const { id, title, contentJson, contentText } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.note.findFirst({
        where: { id, userId: user.id, deletedAt: null },
        select: {
          title: true,
          contentJson: true,
          status: true,
          versions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
      });
      if (!existing) return { error: "Note not found" } as const;
      if (!canEditContent(existing.status)) return { error: FINALISED_MESSAGE } as const;

      const changed = existing.title !== title || !jsonEqual(existing.contentJson, contentJson);
      const updated = await tx.note.update({
        where: { id },
        data: { title, contentJson, contentText },
        select: { updatedAt: true },
      });

      // Snapshot the state *before* this change (what's about to be overwritten), at most once
      // per window — so history can always bring back earlier wording. The current state lives
      // on the note itself.
      const now = new Date();
      if (
        shouldSnapshot({ lastVersionAt: existing.versions[0]?.createdAt ?? null, now, changed })
      ) {
        await tx.noteVersion.create({
          data: {
            noteId: id,
            title: existing.title,
            contentJson: existing.contentJson ?? EMPTY_DOC,
          },
        });
      }
      return updated;
    });

    if ("error" in result) return { ok: false, error: result.error };
    revalidatePath("/notes");
    return { ok: true, updatedAt: result.updatedAt.toISOString() };
  } catch (err) {
    console.error("saveNoteAction failed", err);
    return { ok: false, error: "Couldn't save. Check your connection and try again." };
  }
}

/**
 * Finalises a note: records a final version snapshot and locks the content.
 * Irreversible by design — later changes are amendments.
 */
export async function finaliseNoteAction(id: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!noteIdSchema.safeParse(id).success) return { ok: false, error: "Invalid note" };

  const done = await db.$transaction(async (tx) => {
    const note = await tx.note.findFirst({
      where: { id, userId: user.id, deletedAt: null, status: "DRAFT" },
      select: { title: true, contentJson: true },
    });
    if (!note) return false;
    await tx.noteVersion.create({
      data: { noteId: id, title: note.title, contentJson: note.contentJson ?? EMPTY_DOC },
    });
    await tx.note.update({
      where: { id },
      data: { status: "FINALISED", finalisedAt: new Date() },
    });
    return true;
  });
  if (!done) return { ok: false, error: "Note not found or already finalised" };
  revalidateNote(id);
  return { ok: true };
}

export type AmendmentResult =
  { ok: true; amendment: { id: string; body: string; createdAt: string } } | Fail;

/** Appends a timestamped amendment to a finalised note. Amendments can't be edited or deleted. */
export async function addAmendmentAction(input: {
  noteId: string;
  body: string;
}): Promise<AmendmentResult> {
  const user = await requireUser();
  const parsed = amendmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { noteId, body } = parsed.data;

  const note = await db.note.findFirst({
    where: { id: noteId, userId: user.id, deletedAt: null },
    select: { status: true },
  });
  if (!note) return { ok: false, error: "Note not found" };
  if (note.status !== "FINALISED") {
    return { ok: false, error: "Amendments are for finalised notes — edit the draft directly." };
  }

  const amendment = await db.noteAmendment.create({
    data: { noteId, body },
    select: { id: true, body: true, createdAt: true },
  });
  // Touch the note so it surfaces as recently edited.
  await db.note.update({ where: { id: noteId }, data: { updatedAt: new Date() } });
  revalidateNote(noteId);
  return { ok: true, amendment: { ...amendment, createdAt: amendment.createdAt.toISOString() } };
}

export type VersionDto = { id: string; title: string; createdAt: string };

export async function listVersionsAction(noteId: string): Promise<VersionDto[]> {
  const user = await requireUser();
  if (!noteIdSchema.safeParse(noteId).success) return [];
  const rows = await db.noteVersion.findMany({
    where: { noteId, note: { userId: user.id, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, title: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getVersionAction(
  noteId: string,
  versionId: string,
): Promise<{ ok: true; title: string; contentJson: DocJson } | Fail> {
  const user = await requireUser();
  if (!noteIdSchema.safeParse(noteId).success || !noteIdSchema.safeParse(versionId).success) {
    return { ok: false, error: "Version not found" };
  }
  const v = await db.noteVersion.findFirst({
    where: { id: versionId, noteId, note: { userId: user.id, deletedAt: null } },
    select: { title: true, contentJson: true },
  });
  if (!v) return { ok: false, error: "Version not found" };
  return {
    ok: true,
    title: v.title,
    contentJson: isDocJson(v.contentJson) ? v.contentJson : EMPTY_DOC,
  };
}

/** Records the current state as a version (used right before restoring an older one). */
export async function snapshotNoteAction(noteId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!noteIdSchema.safeParse(noteId).success) return { ok: false };
  const note = await db.note.findFirst({
    where: { id: noteId, userId: user.id, deletedAt: null, status: "DRAFT" },
    select: { title: true, contentJson: true },
  });
  if (!note) return { ok: false };
  await db.noteVersion.create({
    data: { noteId, title: note.title, contentJson: note.contentJson ?? EMPTY_DOC },
  });
  return { ok: true };
}

/** Soft-deletes a note (file notes are compliance records — kept, just hidden). */
export async function deleteNoteAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!noteIdSchema.safeParse(id).success) return { ok: false, error: "Invalid note" };

  const { count } = await db.note.updateMany({
    where: { id, userId: user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) return { ok: false, error: "Note not found" };

  revalidateNote(id);
  return { ok: true };
}
