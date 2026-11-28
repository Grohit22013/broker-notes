import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  parseIsoDate,
  startOfNextZonedDay,
  toIsoDate,
  zonedMidnight,
} from "@broker-notes/shared/dates";
import type {
  AmendmentDto,
  CreatedNoteDto,
  NoteDetailDto,
  NoteFacetsDto,
  NoteListItemDto,
  NoteMetaDto,
  SavedNoteDto,
  VersionDetailDto,
  VersionDto,
} from "@broker-notes/shared/dto";
import { EMPTY_DOC, isDocJson } from "@broker-notes/shared/notes/content";
import {
  buildNoteOrderBy,
  buildNoteWhere,
  type NoteFilters,
} from "@broker-notes/shared/notes/filters";
import { canEditContent, lockedFieldIn } from "@broker-notes/shared/notes/finalise";
import { clean, parseKeyFigures } from "@broker-notes/shared/notes/key-figures";
import { noteFromTemplate } from "@broker-notes/shared/notes/templates";
import type { z } from "zod";
import type { updateNoteMetaSchema, updateNoteSchema } from "@broker-notes/shared/notes/validation";
import { jsonEqual, shouldSnapshot } from "@broker-notes/shared/notes/versioning";

import { PrismaService } from "../prisma/prisma.service";

const LIST_LIMIT = 200;
const EXPORT_LIMIT = 5000;
const FINALISED_MESSAGE = "This note is finalised. Add an amendment instead of editing it.";

const listSelect = {
  id: true,
  title: true,
  contentText: true,
  createdAt: true,
  updatedAt: true,
  noteType: true,
  loanStage: true,
  tags: true,
  followUpAt: true,
  pinned: true,
  status: true,
  keyFigures: true,
  client: { select: { id: true, name: true } },
} satisfies Prisma.NoteSelect;

type ListRow = Prisma.NoteGetPayload<{ select: typeof listSelect }>;

function toListItem(r: ListRow): NoteListItemDto {
  return {
    id: r.id,
    title: r.title,
    contentText: r.contentText,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    noteType: r.noteType,
    loanStage: r.loanStage,
    tags: r.tags,
    followUpAt: r.followUpAt?.toISOString() ?? null,
    pinned: r.pinned,
    status: r.status,
    keyFigures: parseKeyFigures(r.keyFigures),
    client: r.client,
  };
}

type SaveInput = Omit<z.output<typeof updateNoteSchema>, "id">;
type MetaInput = Omit<z.output<typeof updateNoteMetaSchema>, "id">;

/**
 * All note business logic. Every query is scoped by the broker's user id — another broker's
 * note id simply doesn't exist from this user's point of view (404, never 403).
 */
@Injectable()
export class NotesService {
  constructor(private readonly db: PrismaService) {}

  async list(userId: string, filters: NoteFilters, now = new Date()): Promise<NoteListItemDto[]> {
    const rows = await this.db.note.findMany({
      where: buildNoteWhere(userId, filters, now) as Prisma.NoteWhereInput,
      orderBy: buildNoteOrderBy(filters.sort) as Prisma.NoteOrderByWithRelationInput[],
      select: listSelect,
      take: LIST_LIMIT,
    });
    return rows.map(toListItem);
  }

  async facets(userId: string, now = new Date()): Promise<NoteFacetsDto> {
    const base = { userId, deletedAt: null };
    const [total, dueCount, tagRows] = await Promise.all([
      this.db.note.count({ where: base }),
      this.db.note.count({ where: { ...base, followUpAt: { lt: startOfNextZonedDay(now) } } }),
      this.db.note.findMany({
        where: { ...base, NOT: { tags: { isEmpty: true } } },
        select: { tags: true },
      }),
    ]);
    const tags = [...new Set(tagRows.flatMap((r) => r.tags))].sort((a, b) =>
      a.localeCompare(b, "en-AU", { sensitivity: "base" }),
    );
    return { total, dueCount, tags };
  }

  async get(userId: string, id: string): Promise<NoteDetailDto> {
    const note = await this.db.note.findFirst({
      where: { id, userId, deletedAt: null },
      select: {
        ...listSelect,
        contentJson: true,
        finalisedAt: true,
        amendments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, createdAt: true },
        },
      },
    });
    if (!note) throw new NotFoundException("Note not found");
    return {
      ...toListItem(note),
      contentJson: isDocJson(note.contentJson) ? note.contentJson : EMPTY_DOC,
      finalisedAt: note.finalisedAt?.toISOString() ?? null,
      amendments: note.amendments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    };
  }

  async create(userId: string, templateId: string, clientId?: string): Promise<CreatedNoteDto> {
    const client = clientId
      ? await this.db.client.findFirst({
          where: { id: clientId, userId },
          select: { id: true, name: true },
        })
      : null;
    if (clientId && !client) throw new NotFoundException("Client not found");
    const { contentJson, noteType, title } = noteFromTemplate(templateId, client?.name);
    const note = await this.db.note.create({
      data: {
        userId,
        title,
        contentJson,
        noteType,
        clientId: client?.id ?? null,
        versions: { create: { title, contentJson } },
      },
      select: { id: true },
    });
    return note;
  }

  /** Autosave. Snapshots the *previous* state at most once per window (see versioning.ts). */
  async saveContent(userId: string, id: string, input: SaveInput): Promise<SavedNoteDto> {
    const { title, contentJson, contentText } = input;
    const updated = await this.db.$transaction(async (tx) => {
      const existing = await tx.note.findFirst({
        where: { id, userId, deletedAt: null },
        select: {
          title: true,
          contentJson: true,
          status: true,
          versions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
      });
      if (!existing) throw new NotFoundException("Note not found");
      if (!canEditContent(existing.status)) throw new ConflictException(FINALISED_MESSAGE);

      const changed = existing.title !== title || !jsonEqual(existing.contentJson, contentJson);
      const saved = await tx.note.update({
        where: { id },
        data: { title, contentJson, contentText },
        select: { updatedAt: true },
      });
      if (
        shouldSnapshot({
          lastVersionAt: existing.versions[0]?.createdAt ?? null,
          now: new Date(),
          changed,
        })
      ) {
        await tx.noteVersion.create({
          data: {
            noteId: id,
            title: existing.title,
            contentJson: existing.contentJson ?? EMPTY_DOC,
          },
        });
      }
      return saved;
    });
    return { updatedAt: updated.updatedAt.toISOString() };
  }

  /** Details update. On finalised notes only workflow fields may change (server-enforced). */
  async updateMeta(userId: string, id: string, input: MetaInput): Promise<NoteMetaDto> {
    const current = await this.db.note.findFirst({
      where: { id, userId, deletedAt: null },
      select: { status: true },
    });
    if (!current) throw new NotFoundException("Note not found");

    const provided = Object.keys(input).filter((k) => input[k as keyof MetaInput] !== undefined);
    if (lockedFieldIn(current.status, provided)) throw new ConflictException(FINALISED_MESSAGE);

    const { followUpDate, keyFigures, clientId, ...rest } = input;
    if (clientId) {
      const owns = await this.db.client.count({ where: { id: clientId, userId } });
      if (!owns) throw new NotFoundException("Client not found");
    }

    const data: Prisma.NoteUncheckedUpdateManyInput = { ...rest };
    if (followUpDate !== undefined) {
      const ymd = followUpDate === null ? null : parseIsoDate(followUpDate);
      data.followUpAt = ymd ? zonedMidnight(ymd) : null;
    }
    if (clientId !== undefined) data.clientId = clientId;
    if (keyFigures !== undefined) {
      const cleaned = keyFigures ? clean(keyFigures) : {};
      data.keyFigures = Object.keys(cleaned).length ? cleaned : Prisma.DbNull;
    }

    await this.db.note.updateMany({ where: { id, userId, deletedAt: null }, data });
    return this.meta(userId, id);
  }

  async meta(userId: string, id: string): Promise<NoteMetaDto> {
    const n = await this.db.note.findFirst({
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
    if (!n) throw new NotFoundException("Note not found");
    return {
      noteType: n.noteType,
      loanStage: n.loanStage,
      tags: n.tags,
      followUpDate: n.followUpAt ? toIsoDate(n.followUpAt) : null,
      pinned: n.pinned,
      clientId: n.client?.id ?? null,
      clientName: n.client?.name ?? null,
      keyFigures: parseKeyFigures(n.keyFigures),
      status: n.status,
    };
  }

  /** Locks the note as a compliance record, with a final snapshot. Irreversible by design. */
  async finalise(userId: string, id: string): Promise<void> {
    const done = await this.db.$transaction(async (tx) => {
      const note = await tx.note.findFirst({
        where: { id, userId, deletedAt: null },
        select: { title: true, contentJson: true, status: true },
      });
      if (!note) throw new NotFoundException("Note not found");
      if (note.status === "FINALISED") return false;
      await tx.noteVersion.create({
        data: { noteId: id, title: note.title, contentJson: note.contentJson ?? EMPTY_DOC },
      });
      await tx.note.update({
        where: { id },
        data: { status: "FINALISED", finalisedAt: new Date() },
      });
      return true;
    });
    if (!done) throw new ConflictException("This note is already finalised.");
  }

  async addAmendment(userId: string, id: string, body: string): Promise<AmendmentDto> {
    const note = await this.db.note.findFirst({
      where: { id, userId, deletedAt: null },
      select: { status: true },
    });
    if (!note) throw new NotFoundException("Note not found");
    if (note.status !== "FINALISED") {
      throw new BadRequestException(
        "Amendments are for finalised notes — edit the draft directly.",
      );
    }
    const [amendment] = await this.db.$transaction([
      this.db.noteAmendment.create({
        data: { noteId: id, body },
        select: { id: true, body: true, createdAt: true },
      }),
      this.db.note.update({ where: { id }, data: { updatedAt: new Date() }, select: { id: true } }),
    ]);
    return { ...amendment, createdAt: amendment.createdAt.toISOString() };
  }

  async versions(userId: string, id: string): Promise<VersionDto[]> {
    await this.assertOwns(userId, id);
    const rows = await this.db.noteVersion.findMany({
      where: { noteId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, title: true, createdAt: true },
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async version(userId: string, id: string, versionId: string): Promise<VersionDetailDto> {
    const v = await this.db.noteVersion.findFirst({
      where: { id: versionId, noteId: id, note: { userId, deletedAt: null } },
      select: { title: true, contentJson: true },
    });
    if (!v) throw new NotFoundException("Version not found");
    return { title: v.title, contentJson: isDocJson(v.contentJson) ? v.contentJson : EMPTY_DOC };
  }

  /** Records the current state as a version (used right before restoring an older one). */
  async snapshot(userId: string, id: string): Promise<void> {
    const note = await this.db.note.findFirst({
      where: { id, userId, deletedAt: null },
      select: { title: true, contentJson: true, status: true },
    });
    if (!note) throw new NotFoundException("Note not found");
    if (note.status !== "DRAFT") throw new ConflictException(FINALISED_MESSAGE);
    await this.db.noteVersion.create({
      data: { noteId: id, title: note.title, contentJson: note.contentJson ?? EMPTY_DOC },
    });
  }

  /** Soft delete — file notes are compliance records, kept but hidden. */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.db.note.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException("Note not found");
  }

  /** Rows for CSV export: same filters as the list. */
  exportRows(userId: string, filters: NoteFilters) {
    return this.db.note
      .findMany({
        where: buildNoteWhere(userId, filters) as Prisma.NoteWhereInput,
        orderBy: buildNoteOrderBy(filters.sort) as Prisma.NoteOrderByWithRelationInput[],
        take: EXPORT_LIMIT,
        select: { ...listSelect, finalisedAt: true },
      })
      .then((rows) => rows.map((r) => ({ ...r, keyFigures: parseKeyFigures(r.keyFigures) })));
  }

  private async assertOwns(userId: string, id: string) {
    const n = await this.db.note.count({ where: { id, userId, deletedAt: null } });
    if (!n) throw new NotFoundException("Note not found");
  }
}
