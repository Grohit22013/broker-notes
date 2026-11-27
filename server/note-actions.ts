"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { EMPTY_DOC } from "@/lib/notes/content";
import { noteIdSchema, updateNoteSchema, type UpdateNoteInput } from "@/lib/notes/validation";
import { jsonEqual, shouldSnapshot } from "@/lib/notes/versioning";

export type SaveNoteResult = { ok: true; updatedAt: string } | { ok: false; error: string };

/** Creates an empty note for the signed-in broker and opens it in the editor. */
export async function createNoteAction(): Promise<never> {
  const user = await requireUser();
  const note = await db.note.create({
    data: {
      userId: user.id,
      contentJson: EMPTY_DOC,
      versions: { create: { title: "", contentJson: EMPTY_DOC } },
    },
    select: { id: true },
  });
  revalidatePath("/notes");
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
          versions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
      });
      if (!existing) return null;

      const changed = existing.title !== title || !jsonEqual(existing.contentJson, contentJson);
      const updated = await tx.note.update({
        where: { id },
        data: { title, contentJson, contentText },
        select: { updatedAt: true },
      });

      const now = new Date();
      if (
        shouldSnapshot({ lastVersionAt: existing.versions[0]?.createdAt ?? null, now, changed })
      ) {
        await tx.noteVersion.create({ data: { noteId: id, title, contentJson } });
      }
      return updated;
    });

    if (!result) return { ok: false, error: "Note not found" };
    revalidatePath("/notes");
    return { ok: true, updatedAt: result.updatedAt.toISOString() };
  } catch (err) {
    console.error("saveNoteAction failed", err);
    return { ok: false, error: "Couldn't save. Check your connection and try again." };
  }
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

  revalidatePath("/notes");
  return { ok: true };
}
