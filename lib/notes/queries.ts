import "server-only";

import { db } from "@/lib/db";

import { EMPTY_DOC, isDocJson, type DocJson } from "./content";
import { noteIdSchema } from "./validation";

/**
 * Data access for notes. Every query takes the signed-in user's id and filters on it,
 * so a broker can never read another broker's notes — even by guessing an id.
 */

export type NoteListItem = {
  id: string;
  title: string;
  contentText: string;
  updatedAt: Date;
  createdAt: Date;
};

export async function listNotes(userId: string): Promise<NoteListItem[]> {
  return db.note.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, contentText: true, updatedAt: true, createdAt: true },
    take: 200,
  });
}

export type NoteDetail = NoteListItem & { contentJson: DocJson };

export async function getNote(userId: string, id: string): Promise<NoteDetail | null> {
  if (!noteIdSchema.safeParse(id).success) return null;
  const note = await db.note.findFirst({
    where: { id, userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      contentJson: true,
      contentText: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  if (!note) return null;
  return { ...note, contentJson: isDocJson(note.contentJson) ? note.contentJson : EMPTY_DOC };
}
