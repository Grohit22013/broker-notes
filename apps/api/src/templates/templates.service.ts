import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  displayTitle,
  EMPTY_DOC,
  isDocJson,
  type DocJson,
} from "@broker-notes/shared/notes/content";
import type { CreateOrgTemplateInput } from "@broker-notes/shared/notes/validation";
import type { NoteTypeValue } from "@broker-notes/shared/notes/taxonomy";
import type { OrgTemplateDto } from "@broker-notes/shared/dto";

import { AuditService } from "../audit/audit.service";
import type { SessionUser } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

const select = {
  id: true,
  name: true,
  description: true,
  noteType: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.OrgTemplateSelect;

type Row = Prisma.OrgTemplateGetPayload<{ select: typeof select }>;

const toDto = (r: Row, actor: SessionUser): OrgTemplateDto => ({
  id: r.id,
  name: r.name,
  description: r.description,
  noteType: r.noteType,
  createdBy: r.createdBy,
  createdAt: r.createdAt.toISOString(),
  canRemove: actor.role === "ADMIN" || actor.id === r.createdById,
});

/**
 * The brokerage's own note templates, saved from an existing note's structure. Removed templates
 * are archived (kept), never deleted.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: SessionUser): Promise<OrgTemplateDto[]> {
    const rows = await this.db.orgTemplate.findMany({
      where: { organisationId: actor.organisationId, archivedAt: null },
      orderBy: { name: "asc" },
      select,
    });
    return rows.map((r) => toDto(r, actor));
  }

  async create(actor: SessionUser, input: CreateOrgTemplateInput): Promise<OrgTemplateDto> {
    const note = await this.db.note.findFirst({
      where: { id: input.noteId, organisationId: actor.organisationId, deletedAt: null },
      select: { title: true, contentJson: true, noteType: true },
    });
    if (!note) throw new NotFoundException({ message: "Note not found", field: "noteId" });
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.orgTemplate.create({
        data: {
          organisationId: actor.organisationId,
          name: input.name.trim(),
          description: input.description ?? null,
          noteType: note.noteType,
          title: input.title?.trim() || `${input.name.trim()} – {client}`,
          contentJson: isDocJson(note.contentJson) ? note.contentJson : EMPTY_DOC,
          createdById: actor.id,
        },
        select,
      });
      await this.audit.record(
        actor,
        {
          action: "template.created",
          summary: `Saved the template “${created.name}” from “${displayTitle(note.title)}”`,
          entityType: "template",
          entityId: created.id,
        },
        tx,
      );
      return created;
    });
    return toDto(row, actor);
  }

  async remove(actor: SessionUser, id: string): Promise<void> {
    const row = await this.db.orgTemplate.findFirst({
      where: { id, organisationId: actor.organisationId, archivedAt: null },
      select: { name: true, createdById: true },
    });
    if (!row) throw new NotFoundException("Template not found");
    if (actor.role !== "ADMIN" && actor.id !== row.createdById) {
      throw new ForbiddenException("Only the template's creator or an admin can remove it.");
    }
    await this.db.$transaction(async (tx) => {
      await tx.orgTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.record(
        actor,
        {
          action: "template.removed",
          summary: `Removed the template “${row.name}”`,
          entityType: "template",
          entityId: id,
        },
        tx,
      );
    });
  }

  /** Content, type and title for a new note from one of the brokerage's templates. */
  async noteFrom(
    organisationId: string,
    templateId: string,
    clientName?: string | null,
  ): Promise<{ contentJson: DocJson; noteType: NoteTypeValue; title: string } | null> {
    const t = await this.db.orgTemplate.findFirst({
      where: { id: templateId, organisationId, archivedAt: null },
      select: { title: true, contentJson: true, noteType: true },
    });
    if (!t) return null;
    const title = clientName
      ? t.title.replace("{client}", clientName)
      : t.title.replace(/\s*[–-]\s*\{client\}/, "").replace("{client}", "");
    return {
      contentJson: isDocJson(t.contentJson) ? t.contentJson : EMPTY_DOC,
      noteType: t.noteType,
      title,
    };
  }
}
