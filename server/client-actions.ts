"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { existingClientEmails } from "@/lib/clients/queries";
import {
  IMPORT_MAX_ROWS,
  clientIdSchema,
  clientSchema,
  summariseImport,
  validateImportRows,
  type ClientInput,
  type ImportRowResult,
} from "@/lib/clients/validation";
import { db } from "@/lib/db";

export type ClientDto = { id: string; name: string; email: string | null; phone: string | null };
export type ClientResult =
  | { ok: true; client: ClientDto }
  | { ok: false; error: string; field?: "name" | "email" | "phone" };

const select = { id: true, name: true, email: true, phone: true } as const;

function duplicateEmail(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createClientAction(input: ClientInput): Promise<ClientResult> {
  const user = await requireUser();
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Invalid client", field: issue?.path[0] as never };
  }
  try {
    const client = await db.client.create({ data: { ...parsed.data, userId: user.id }, select });
    revalidatePath("/clients");
    return { ok: true, client };
  } catch (err) {
    if (duplicateEmail(err)) {
      return { ok: false, error: "You already have a client with this email", field: "email" };
    }
    throw err;
  }
}

export async function updateClientAction(id: string, input: ClientInput): Promise<ClientResult> {
  const user = await requireUser();
  if (!clientIdSchema.safeParse(id).success) return { ok: false, error: "Client not found" };
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Invalid client", field: issue?.path[0] as never };
  }
  try {
    const { count } = await db.client.updateMany({
      where: { id, userId: user.id },
      data: parsed.data,
    });
    if (count === 0) return { ok: false, error: "Client not found" };
    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    const client = await db.client.findUniqueOrThrow({ where: { id }, select });
    return { ok: true, client };
  } catch (err) {
    if (duplicateEmail(err)) {
      return { ok: false, error: "You already have a client with this email", field: "email" };
    }
    throw err;
  }
}

const importPayload = z
  .array(z.record(z.string(), z.string().max(1000)))
  .max(IMPORT_MAX_ROWS, `A file can have at most ${IMPORT_MAX_ROWS} rows`);

const mappingSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export type ImportResult =
  | {
      ok: true;
      imported: number;
      duplicates: number;
      invalid: number;
      problems: Extract<ImportRowResult, { status: "invalid" | "duplicate" }>[];
    }
  | { ok: false; error: string };

/**
 * Imports clients from parsed CSV rows. Everything is re-validated on the server (never trust the
 * browser's preview) and duplicates by email are skipped and reported, not overwritten.
 */
export async function importClientsAction(
  rows: Record<string, string>[],
  mapping: { name: string | null; email: string | null; phone: string | null },
): Promise<ImportResult> {
  const user = await requireUser();
  const parsedRows = importPayload.safeParse(rows);
  const parsedMapping = mappingSchema.safeParse(mapping);
  if (!parsedRows.success) return { ok: false, error: parsedRows.error.issues[0]!.message };
  if (!parsedMapping.success || !parsedMapping.data.name) {
    return { ok: false, error: "Choose which column holds the client's name" };
  }

  const results = validateImportRows(
    parsedRows.data,
    parsedMapping.data,
    await existingClientEmails(user.id),
  );
  const valid = results.filter((r) => r.status === "valid");
  const { count } = await db.client.createMany({
    data: valid.map((r) => ({ ...r.data, userId: user.id })),
    skipDuplicates: true, // guards a race with a concurrent import / manual add
  });

  revalidatePath("/clients");
  const summary = summariseImport(results);
  return {
    ok: true,
    imported: count,
    duplicates: summary.duplicates + (valid.length - count),
    invalid: summary.invalid,
    problems: results.filter(
      (r): r is Extract<ImportRowResult, { status: "invalid" | "duplicate" }> =>
        r.status !== "valid",
    ),
  };
}
