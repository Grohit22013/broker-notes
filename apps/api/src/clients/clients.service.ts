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

import { PrismaService } from "../prisma/prisma.service";

const select = { id: true, name: true, email: true, phone: true } as const;
const activeNotes = { where: { deletedAt: null } } as const;

function duplicateEmail(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictException({
      message: "You already have a client with this email",
      field: "email",
    });
  }
  throw err;
}

/** Client records. All queries are scoped to the signed-in broker. */
@Injectable()
export class ClientsService {
  constructor(private readonly db: PrismaService) {}

  async list(userId: string, q = ""): Promise<ClientListItemDto[]> {
    const term = q.trim().slice(0, 100);
    const rows = await this.db.client.findMany({
      where: {
        userId,
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
      noteCount: r._count.notes,
      lastNoteAt: r.notes[0]?.updatedAt.toISOString() ?? null,
    }));
  }

  options(userId: string): Promise<{ id: string; name: string }[]> {
    return this.db.client.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 1000,
    });
  }

  /** Lower-cased emails of existing clients — lets the import preview flag duplicates. */
  async emails(userId: string): Promise<string[]> {
    const rows = await this.db.client.findMany({
      where: { userId, email: { not: null } },
      select: { email: true },
    });
    return rows.map((r) => r.email!).filter(Boolean);
  }

  async get(userId: string, id: string): Promise<ClientDetailDto> {
    const c = await this.db.client.findFirst({
      where: { id, userId },
      select: { ...select, createdAt: true },
    });
    if (!c) throw new NotFoundException("Client not found");
    return { ...c, createdAt: c.createdAt.toISOString() };
  }

  async create(userId: string, data: ClientData): Promise<ClientDto> {
    return this.db.client.create({ data: { ...data, userId }, select }).catch(duplicateEmail);
  }

  async update(userId: string, id: string, data: ClientData): Promise<ClientDto> {
    const { count } = await this.db.client
      .updateMany({ where: { id, userId }, data })
      .catch(duplicateEmail);
    if (count === 0) throw new NotFoundException("Client not found");
    return this.db.client.findUniqueOrThrow({ where: { id }, select });
  }

  /** Server re-validates every row (never trusts the browser preview); duplicates are skipped. */
  async import(
    userId: string,
    rows: Record<string, string>[],
    mapping: ColumnMapping,
  ): Promise<ImportResultDto> {
    const existing = new Set(await this.emails(userId));
    const results = validateImportRows(rows, mapping, existing);
    const valid = results.filter((r) => r.status === "valid");
    const { count } = await this.db.client.createMany({
      data: valid.map((r) => ({ ...r.data, userId })),
      skipDuplicates: true,
    });
    const summary = summariseImport(results);
    const problems: ImportProblemDto[] = results.flatMap((r) =>
      r.status === "valid" ? [] : [{ row: r.row, status: r.status, reason: r.reason }],
    );
    return {
      imported: count,
      duplicates: summary.duplicates + (valid.length - count),
      invalid: summary.invalid,
      problems,
    };
  }
}
