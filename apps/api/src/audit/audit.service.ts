import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuditEntryDto, AuditPageDto } from "@broker-notes/shared/dto";
import { AUDIT_PAGE_SIZE, auditCategory, type AuditAction } from "@broker-notes/shared/orgs/audit";
import type { AuditQuery } from "@broker-notes/shared/orgs/validation";

import { PrismaService } from "../prisma/prisma.service";

type Db = Pick<PrismaService, "auditLog">;

export type AuditEvent = {
  action: AuditAction;
  /** Human-readable one-liner, e.g. "Finalised “Fact find — Nguyen family”". */
  summary: string;
  entityType?:
    | "note"
    | "client"
    | "case"
    | "task"
    | "template"
    | "member"
    | "invite"
    | "organisation"
    | "export";
  entityId?: string;
  /** Small structured details only — never note content or personal identifiers. */
  metadata?: Prisma.InputJsonObject;
};

/** Who did it and in which brokerage. */
export type AuditActor = { id: string; organisationId: string };

/** Append-only activity log (FR-17). Writes are never updated or deleted by the app. */
@Injectable()
export class AuditService {
  constructor(private readonly db: PrismaService) {}

  /** Pass a transaction client as `tx` to record atomically with the change itself. */
  async record(actor: AuditActor, event: AuditEvent, tx: Db = this.db): Promise<void> {
    await tx.auditLog.create({
      data: {
        organisationId: actor.organisationId,
        userId: actor.id,
        action: event.action,
        summary: event.summary.slice(0, 300),
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        metadata: event.metadata ?? undefined,
      },
    });
  }

  /** Newest first, keyset-paginated by id (stable under concurrent inserts). */
  async list(organisationId: string, query: AuditQuery): Promise<AuditPageDto> {
    const where: Prisma.AuditLogWhereInput = { organisationId };
    if (query.category) {
      where.OR = auditCategory(query.category).prefixes.map((p) => ({
        action: { startsWith: p },
      }));
    }
    const rows = await this.db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: AUDIT_PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        summary: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    });
    const page = rows.slice(0, AUDIT_PAGE_SIZE);
    const items: AuditEntryDto[] = page.map((r) => ({
      ...r,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    return {
      items,
      nextCursor: rows.length > AUDIT_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
    };
  }
}
