import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  parseIsoDate,
  parseLocalDateTime,
  startOfNextZonedDay,
  toIsoDate,
  toLocalDateTime,
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
import { displayTitle, EMPTY_DOC, isDocJson } from "@broker-notes/shared/notes/content";
import {
  buildNoteOrderBy,
  buildNoteWhere,
  type NoteFilters,
} from "@broker-notes/shared/notes/filters";
import { canEditContent, lockedFieldIn } from "@broker-notes/shared/notes/finalise";
import { clean, parseKeyFigures } from "@broker-notes/shared/notes/key-figures";
import { noteFromTemplate } from "@broker-notes/shared/notes/templates";
import { z } from "zod";
import type { updateNoteMetaSchema, updateNoteSchema } from "@broker-notes/shared/notes/validation";
import { jsonEqual, shouldSnapshot } from "@broker-notes/shared/notes/versioning";
import { canEditNote } from "@broker-notes/shared/orgs/roles";

import { AuditService } from "../audit/audit.service";
import type { SessionUser } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { TemplatesService } from "../templates/templates.service";

const LIST_LIMIT = 200;
const EXPORT_LIMIT = 5000;
const FINALISED_MESSAGE = "This note is finalised. Add an amendment instead of editing it.";
const NOT_AUTHOR_MESSAGE = "Only the note's author or a brokerage admin can change this note.";

export const listSelect = {
  id: true,
  title: true,
  contentText: true,
  createdAt: true,
  updatedAt: true,
  noteType: true,
  loanStage: true,
  tags: true,
  followUpAt: true,
  meetingAt: true,
  pinned: true,
  status: true,
  keyFigures: true,
  client: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
  case: { select: { id: true, reference: true } },
  favourites: { select: { userId: true } },
} satisfies Prisma.NoteSelect;

type ListRow = Prisma.NoteGetPayload<{ select: typeof listSelect }>;

/** List item as seen by `viewerId` (favourites are personal). */
export function toListItem(r: ListRow, viewerId: string): NoteListItemDto {
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
    meetingAt: r.meetingAt?.toISOString() ?? null,
    pinned: r.pinned,
    status: r.status,
    keyFigures: parseKeyFigures(r.keyFigures),
    client: r.client,
    author: r.user,
    case: r.case,
    favourite: r.favourites.some((f) => f.userId === viewerId),
  };
}

type SaveInput = Omit<z.output<typeof updateNoteSchema>, "id">;
type MetaInput = Omit<z.output<typeof updateNoteMetaSchema>, "id">;

type Tx = Prisma.TransactionClient;

/**
 * All note business logic. Every query is scoped by the member's organisation — another
 * brokerage's note id simply doesn't exist from this member's point of view (404, never 403).
 * Inside the brokerage everyone may read; only the author or an admin may change a note (403).
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly templates: TemplatesService,
  ) {}

  /**
   * Loads a note the actor may change, or throws 404 (not in their brokerage) / 403 (another
   * member's note and the actor isn't an admin).
   */
  private async editable(tx: Tx | PrismaService, actor: SessionUser, id: string) {
    const note = await tx.note.findFirst({
      where: { id, organisationId: actor.organisationId, deletedAt: null },
      select: {
        userId: true,
        title: true,
        status: true,
        contentJson: true,
        revision: true,
        updatedAt: true,
        versions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        case: { select: { clientId: true } },
      },
    });
    if (!note) throw new NotFoundException("Note not found");
    if (!canEditNote(actor, note.userId)) throw new ForbiddenException(NOT_AUTHOR_MESSAGE);
    return note;
  }

  async list(
    actor: SessionUser,
    filters: NoteFilters,
    now = new Date(),
  ): Promise<NoteListItemDto[]> {
    const rows = await this.db.note.findMany({
      where: buildNoteWhere(scopeOf(actor), filters, now) as Prisma.NoteWhereInput,
      orderBy: buildNoteOrderBy(filters.sort) as Prisma.NoteOrderByWithRelationInput[],
      select: listSelect,
      take: LIST_LIMIT,
    });
    return rows.map((r) => toListItem(r, actor.id));
  }

  async facets(actor: SessionUser, now = new Date()): Promise<NoteFacetsDto> {
    const base = { organisationId: actor.organisationId, deletedAt: null };
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

  async get(actor: SessionUser, id: string): Promise<NoteDetailDto> {
    const note = await this.db.note.findFirst({
      where: { id, organisationId: actor.organisationId, deletedAt: null },
      select: {
        ...listSelect,
        contentJson: true,
        revision: true,
        finalisedAt: true,
        amendments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, createdAt: true },
        },
      },
    });
    if (!note) throw new NotFoundException("Note not found");
    return {
      ...toListItem(note, actor.id),
      revision: note.revision,
      contentJson: isDocJson(note.contentJson) ? note.contentJson : EMPTY_DOC,
      finalisedAt: note.finalisedAt?.toISOString() ?? null,
      amendments: note.amendments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    };
  }

  async create(
    actor: SessionUser,
    templateId: string,
    requestedClientId?: string,
    caseId?: string,
  ): Promise<CreatedNoteDto> {
    const linkedCase = caseId
      ? await this.db.mortgageCase.findFirst({
          where: { id: caseId, organisationId: actor.organisationId },
          select: { id: true, clientId: true },
        })
      : null;
    if (caseId && !linkedCase) throw new NotFoundException("Case not found");
    // A case belongs to one client, so the case decides the client.
    const clientId = linkedCase?.clientId ?? requestedClientId;
    const client = clientId
      ? await this.db.client.findFirst({
          where: { id: clientId, organisationId: actor.organisationId },
          select: { id: true, name: true },
        })
      : null;
    if (clientId && !client) throw new NotFoundException("Client not found");
    // A cuid is one of the brokerage's own templates; anything else is a built-in id.
    const fromOrg = z.cuid().safeParse(templateId).success
      ? await this.templates.noteFrom(actor.organisationId, templateId, client?.name)
      : null;
    if (z.cuid().safeParse(templateId).success && !fromOrg) {
      throw new NotFoundException("Template not found");
    }
    const { contentJson, noteType, title } = fromOrg ?? noteFromTemplate(templateId, client?.name);
    return this.db.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: {
          organisationId: actor.organisationId,
          userId: actor.id,
          title,
          contentJson,
          noteType,
          clientId: client?.id ?? null,
          // A client-meeting note starts with "now" (to the quarter hour) as the meeting time.
          meetingAt: templateId === "client-meeting" ? quarterHour(new Date()) : null,
          caseId: linkedCase?.id ?? null,
          versions: { create: { title, contentJson } },
        },
        select: { id: true },
      });
      await this.audit.record(
        actor,
        {
          action: "note.created",
          summary: `Created “${displayTitle(title)}”`,
          entityType: "note",
          entityId: note.id,
          metadata: { template: templateId },
        },
        tx,
      );
      return note;
    });
  }

  /** Autosave. Snapshots the *previous* state at most once per window (see versioning.ts). */
  async saveContent(actor: SessionUser, id: string, input: SaveInput): Promise<SavedNoteDto> {
    const { title, contentJson, contentText, baseRevision } = input;
    const updated = await this.db.$transaction(async (tx) => {
      const existing = await this.editable(tx, actor, id);
      if (!canEditContent(existing.status)) throw new ConflictException(FINALISED_MESSAGE);

      const changed = existing.title !== title || !jsonEqual(existing.contentJson, contentJson);
      // Conditional on the revision the edits were based on: if anyone saved in between, nothing
      // is written and the caller gets the latest version to decide what to keep.
      const { count } = await tx.note.updateMany({
        where: { id, ...(baseRevision !== undefined ? { revision: baseRevision } : {}) },
        data: { title, contentJson, contentText, revision: { increment: 1 } },
      });
      if (count === 0) {
        throw new ConflictException({
          message:
            "This note was changed in another tab or by a colleague since you opened it. " +
            "Choose which version to keep.",
          code: "NOTE_CONFLICT",
          latest: {
            revision: existing.revision,
            title: existing.title,
            contentJson: isDocJson(existing.contentJson) ? existing.contentJson : EMPTY_DOC,
            updatedAt: existing.updatedAt.toISOString(),
            updatedBy: null,
          },
        });
      }
      const saved = await tx.note.findUniqueOrThrow({
        where: { id },
        select: { updatedAt: true, revision: true },
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
    return { updatedAt: updated.updatedAt.toISOString(), revision: updated.revision };
  }

  /** Stars or unstars a note for the signed-in member (any member who can read it). */
  async setFavourite(actor: SessionUser, id: string, favourite: boolean): Promise<void> {
    await this.assertVisible(actor, id);
    if (favourite) {
      await this.db.noteFavourite.upsert({
        where: { userId_noteId: { userId: actor.id, noteId: id } },
        create: { userId: actor.id, noteId: id },
        update: {},
      });
    } else {
      await this.db.noteFavourite.deleteMany({ where: { userId: actor.id, noteId: id } });
    }
  }

  /** Details update. On finalised notes only workflow fields may change (server-enforced). */
  async updateMeta(actor: SessionUser, id: string, input: MetaInput): Promise<NoteMetaDto> {
    const current = await this.editable(this.db, actor, id);

    const provided = Object.keys(input).filter((k) => input[k as keyof MetaInput] !== undefined);
    if (lockedFieldIn(current.status, provided)) throw new ConflictException(FINALISED_MESSAGE);

    const { followUpDate, meetingAt, keyFigures, clientId, caseId, ...rest } = input;
    if (clientId) {
      const owns = await this.db.client.count({
        where: { id: clientId, organisationId: actor.organisationId },
      });
      if (!owns) throw new NotFoundException("Client not found");
    }

    const data: Prisma.NoteUncheckedUpdateManyInput = { ...rest };
    if (meetingAt !== undefined) {
      data.meetingAt = meetingAt === null ? null : parseLocalDateTime(meetingAt);
    }
    if (followUpDate !== undefined) {
      const ymd = followUpDate === null ? null : parseIsoDate(followUpDate);
      data.followUpAt = ymd ? zonedMidnight(ymd) : null;
    }
    if (clientId !== undefined) {
      data.clientId = clientId;
      // Moving the note to another client unlinks a case that belongs to the old one.
      if (caseId === undefined && current.case && current.case.clientId !== clientId) {
        data.caseId = null;
      }
    }
    if (caseId) {
      const linked = await this.db.mortgageCase.findFirst({
        where: { id: caseId, organisationId: actor.organisationId },
        select: { clientId: true },
      });
      if (!linked) throw new NotFoundException("Case not found");
      data.caseId = caseId;
      data.clientId = linked.clientId;
    } else if (caseId === null) {
      data.caseId = null;
    }
    if (keyFigures !== undefined) {
      const cleaned = keyFigures ? clean(keyFigures) : {};
      data.keyFigures = Object.keys(cleaned).length ? cleaned : Prisma.DbNull;
    }

    await this.db.$transaction(async (tx) => {
      await tx.note.updateMany({
        where: { id, organisationId: actor.organisationId, deletedAt: null },
        data,
      });
      await this.audit.record(
        actor,
        {
          action: "note.details_updated",
          summary: `Updated details of “${displayTitle(current.title)}” (${provided.join(", ")})`,
          entityType: "note",
          entityId: id,
          metadata: { fields: provided },
        },
        tx,
      );
    });
    return this.meta(actor, id);
  }

  async meta(actor: SessionUser, id: string): Promise<NoteMetaDto> {
    const n = await this.db.note.findFirst({
      where: { id, organisationId: actor.organisationId },
      select: {
        noteType: true,
        loanStage: true,
        tags: true,
        followUpAt: true,
        meetingAt: true,
        pinned: true,
        status: true,
        keyFigures: true,
        client: { select: { id: true, name: true } },
        case: { select: { id: true, reference: true } },
      },
    });
    if (!n) throw new NotFoundException("Note not found");
    return {
      noteType: n.noteType,
      loanStage: n.loanStage,
      tags: n.tags,
      followUpDate: n.followUpAt ? toIsoDate(n.followUpAt) : null,
      meetingAt: n.meetingAt ? toLocalDateTime(n.meetingAt) : null,
      pinned: n.pinned,
      clientId: n.client?.id ?? null,
      clientName: n.client?.name ?? null,
      caseId: n.case?.id ?? null,
      caseReference: n.case?.reference ?? null,
      keyFigures: parseKeyFigures(n.keyFigures),
      status: n.status,
    };
  }

  /** Locks the note as a compliance record, with a final snapshot. Irreversible by design. */
  async finalise(actor: SessionUser, id: string): Promise<void> {
    const done = await this.db.$transaction(async (tx) => {
      const note = await this.editable(tx, actor, id);
      if (note.status === "FINALISED") return false;
      await tx.noteVersion.create({
        data: { noteId: id, title: note.title, contentJson: note.contentJson ?? EMPTY_DOC },
      });
      await tx.note.update({
        where: { id },
        data: { status: "FINALISED", finalisedAt: new Date() },
      });
      await this.audit.record(
        actor,
        {
          action: "note.finalised",
          summary: `Finalised “${displayTitle(note.title)}”`,
          entityType: "note",
          entityId: id,
        },
        tx,
      );
      return true;
    });
    if (!done) throw new ConflictException("This note is already finalised.");
  }

  async addAmendment(actor: SessionUser, id: string, body: string): Promise<AmendmentDto> {
    const note = await this.editable(this.db, actor, id);
    if (note.status !== "FINALISED") {
      throw new BadRequestException(
        "Amendments are for finalised notes — edit the draft directly.",
      );
    }
    const amendment = await this.db.$transaction(async (tx) => {
      const created = await tx.noteAmendment.create({
        data: { noteId: id, body },
        select: { id: true, body: true, createdAt: true },
      });
      await tx.note.update({
        where: { id },
        data: { updatedAt: new Date() },
        select: { id: true },
      });
      await this.audit.record(
        actor,
        {
          action: "note.amended",
          summary: `Added an amendment to “${displayTitle(note.title)}”`,
          entityType: "note",
          entityId: id,
        },
        tx,
      );
      return created;
    });
    return { ...amendment, createdAt: amendment.createdAt.toISOString() };
  }

  async versions(actor: SessionUser, id: string): Promise<VersionDto[]> {
    await this.assertVisible(actor, id);
    const rows = await this.db.noteVersion.findMany({
      where: { noteId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, title: true, createdAt: true },
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async version(actor: SessionUser, id: string, versionId: string): Promise<VersionDetailDto> {
    const v = await this.db.noteVersion.findFirst({
      where: {
        id: versionId,
        noteId: id,
        note: { organisationId: actor.organisationId, deletedAt: null },
      },
      select: { title: true, contentJson: true },
    });
    if (!v) throw new NotFoundException("Version not found");
    return { title: v.title, contentJson: isDocJson(v.contentJson) ? v.contentJson : EMPTY_DOC };
  }

  /** Records the current state as a version (used right before restoring an older one). */
  async snapshot(actor: SessionUser, id: string): Promise<void> {
    const note = await this.editable(this.db, actor, id);
    if (note.status !== "DRAFT") throw new ConflictException(FINALISED_MESSAGE);
    await this.db.$transaction(async (tx) => {
      await tx.noteVersion.create({
        data: { noteId: id, title: note.title, contentJson: note.contentJson ?? EMPTY_DOC },
      });
      await this.audit.record(
        actor,
        {
          action: "note.version_restored",
          summary: `Restored an earlier version of “${displayTitle(note.title)}”`,
          entityType: "note",
          entityId: id,
        },
        tx,
      );
    });
  }

  /** Soft delete — file notes are compliance records, kept but hidden. */
  async remove(actor: SessionUser, id: string): Promise<void> {
    const note = await this.editable(this.db, actor, id);
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.note.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException("Note not found");
      await this.audit.record(
        actor,
        {
          action: "note.deleted",
          summary: `Deleted “${displayTitle(note.title)}” (kept for compliance)`,
          entityType: "note",
          entityId: id,
        },
        tx,
      );
    });
  }

  /** Rows for CSV export: same filters as the list. */
  exportRows(actor: SessionUser, filters: NoteFilters) {
    return this.db.note
      .findMany({
        where: buildNoteWhere(scopeOf(actor), filters) as Prisma.NoteWhereInput,
        orderBy: buildNoteOrderBy(filters.sort) as Prisma.NoteOrderByWithRelationInput[],
        take: EXPORT_LIMIT,
        select: { ...listSelect, finalisedAt: true },
      })
      .then((rows) => rows.map((r) => ({ ...r, keyFigures: parseKeyFigures(r.keyFigures) })));
  }

  private async assertVisible(actor: SessionUser, id: string) {
    const n = await this.db.note.count({
      where: { id, organisationId: actor.organisationId, deletedAt: null },
    });
    if (!n) throw new NotFoundException("Note not found");
  }
}

/** Rounds down to the quarter hour (meeting times read better as 10:15 than 10:17). */
const quarterHour = (d: Date) => new Date(Math.floor(d.getTime() / 900_000) * 900_000);

const scopeOf = (actor: SessionUser) => ({
  organisationId: actor.organisationId,
  userId: actor.id,
});
