import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  summariseImport,
  validateImportRows,
  type ClientData,
  type ColumnMapping,
} from "@broker-notes/shared/clients/validation";
import type {
  ClientDetailDto,
  ClientDto,
  ClientListItemDto,
  ImportProblemDto,
  ImportResultDto,
} from "@broker-notes/shared/dto";

import { AuditService } from "../audit/audit.service";
import type { SessionUser } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

const select = {
  id: true,
  name: true,
  email: true,
  phone: true,
  assignedAdviser: { select: { id: true, name: true } },
} as const;
const activeNotes = { where: { deletedAt: null } } as const;

function duplicateEmail(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictException({
      message: "Your brokerage already has a client with this email",
      field: "email",
    });
  }
  throw err;
}

/** Client records, shared by everyone in the brokerage. All queries are scoped to it. */
@Injectable()
export class ClientsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organisationId: string, q = ""): Promise<ClientListItemDto[]> {
    const term = q.trim().slice(0, 100);
    const rows = await this.db.client.findMany({
      where: {
        organisationId,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { email: { contains: term, mode: "insensitive" } },
                { phone: { contains: term } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        ...select,
        _count: { select: { notes: activeNotes } },
        notes: {
          ...activeNotes,
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      assignedAdviser: r.assignedAdviser,
      noteCount: r._count.notes,
      lastNoteAt: r.notes[0]?.updatedAt.toISOString() ?? null,
    }));
  }

  options(organisationId: string): Promise<{ id: string; name: string }[]> {
    return this.db.client.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 1000,
    });
  }

  /** Lower-cased emails of existing clients — lets the import preview flag duplicates. */
  async emails(organisationId: string): Promise<string[]> {
    const rows = await this.db.client.findMany({
      where: { organisationId, email: { not: null } },
      select: { email: true },
    });
    return rows.map((r) => r.email!).filter(Boolean);
  }

  async get(organisationId: string, id: string): Promise<ClientDetailDto> {
    const c = await this.db.client.findFirst({
      where: { id, organisationId },
      select: { ...select, createdAt: true },
    });
    if (!c) throw new NotFoundException("Client not found");
    return { ...c, createdAt: c.createdAt.toISOString() };
  }

  async create(actor: SessionUser, data: ClientData): Promise<ClientDto> {
    await this.assertAdviser(actor, data.assignedAdviserId);
    return this.db
      .$transaction(async (tx) => {
        const client = await tx.client.create({
          data: { ...data, organisationId: actor.organisationId, userId: actor.id },
          select,
        });
        await this.audit.record(
          actor,
          {
            action: "client.created",
            summary: `Added client ${client.name}`,
            entityType: "client",
            entityId: client.id,
          },
          tx,
        );
        return client;
      })
      .catch(duplicateEmail);
  }

  async update(actor: SessionUser, id: string, data: ClientData): Promise<ClientDto> {
    await this.assertAdviser(actor, data.assignedAdviserId);
    return this.db
      .$transaction(async (tx) => {
        const { count } = await tx.client.updateMany({
          where: { id, organisationId: actor.organisationId },
          data,
        });
        if (count === 0) throw new NotFoundException("Client not found");
        const client = await tx.client.findUniqueOrThrow({ where: { id }, select });
        await this.audit.record(
          actor,
          {
            action: "client.updated",
            summary: `Updated client ${client.name}`,
            entityType: "client",
            entityId: id,
          },
          tx,
        );
        return client;
      })
      .catch(duplicateEmail);
  }

  /** Server re-validates every row (never trusts the browser preview); duplicates are skipped. */
  async import(
    actor: SessionUser,
    rows: Record<string, string>[],
    mapping: ColumnMapping,
  ): Promise<ImportResultDto> {
    const existing = new Set(await this.emails(actor.organisationId));
    const results = validateImportRows(rows, mapping, existing);
    const valid = results.filter((r) => r.status === "valid");
    const { count } = await this.db.client.createMany({
      data: valid.map((r) => ({
        ...r.data,
        organisationId: actor.organisationId,
        userId: actor.id,
      })),
      skipDuplicates: true,
    });
    const summary = summariseImport(results);
    const result = {
      imported: count,
      duplicates: summary.duplicates + (valid.length - count),
      invalid: summary.invalid,
    };
    await this.audit.record(actor, {
      action: "clients.imported",
      summary: `Imported ${count} client${count === 1 ? "" : "s"} from CSV`,
      entityType: "client",
      metadata: result,
    });
    const problems: ImportProblemDto[] = results.flatMap((r) =>
      r.status === "valid" ? [] : [{ row: r.row, status: r.status, reason: r.reason }],
    );
    return { ...result, problems };
  }

  /** The assigned adviser must be an active member of the same brokerage. */
  private async assertAdviser(actor: SessionUser, adviserId: string | null | undefined) {
    if (!adviserId) return;
    const ok = await this.db.user.count({
      where: { id: adviserId, organisationId: actor.organisationId, deactivatedAt: null },
    });
    if (!ok) {
      throw new NotFoundException({ message: "Adviser not found", field: "assignedAdviserId" });
    }
  }
}
