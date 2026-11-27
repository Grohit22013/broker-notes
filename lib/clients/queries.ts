import "server-only";

import { db } from "@/lib/db";

import { clientIdSchema } from "./validation";

/** All client queries are scoped to the signed-in broker. */

const activeNotes = { where: { deletedAt: null } } as const;

export type ClientListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  noteCount: number;
  lastNoteAt: Date | null;
};

export async function listClients(userId: string, q = ""): Promise<ClientListItem[]> {
  const term = q.trim().slice(0, 100);
  const rows = await db.client.findMany({
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
      id: true,
      name: true,
      email: true,
      phone: true,
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
    lastNoteAt: r.notes[0]?.updatedAt ?? null,
  }));
}

export type ClientOption = { id: string; name: string };

/** Lightweight list for pickers. */
export async function clientOptions(userId: string): Promise<ClientOption[]> {
  return db.client.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 1000,
  });
}

export async function getClient(userId: string, id: string) {
  if (!clientIdSchema.safeParse(id).success) return null;
  return db.client.findFirst({
    where: { id, userId },
    select: { id: true, name: true, email: true, phone: true, createdAt: true },
  });
}

/** Lower-cased emails of the broker's existing clients (for import de-duplication). */
export async function existingClientEmails(userId: string): Promise<Set<string>> {
  const rows = await db.client.findMany({
    where: { userId, email: { not: null } },
    select: { email: true },
  });
  return new Set(rows.map((r) => r.email!).filter(Boolean));
}

/** True when the client exists and belongs to this broker. */
export async function ownsClient(userId: string, clientId: string): Promise<boolean> {
  if (!clientIdSchema.safeParse(clientId).success) return false;
  return (await db.client.count({ where: { id: clientId, userId } })) === 1;
}
