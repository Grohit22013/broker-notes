import "server-only";

import { db } from "@/lib/db";
import { startOfNextZonedDay } from "@/lib/dates";

import { EMPTY_DOC, isDocJson, type DocJson } from "./content";
import { buildNoteOrderBy, buildNoteWhere, type NoteFilters } from "./filters";
import type { LoanStageValue, NoteTypeValue } from "./taxonomy";
import { noteIdSchema } from "./validation";

/**
 * Data access for notes. Every query takes the signed-in user's id and filters on it,
 * so a broker can never read another broker's notes — even by guessing an id.
 */

const LIST_LIMIT = 200;

const metaSelect = {
  noteType: true,
  loanStage: true,
  tags: true,
  followUpAt: true,
  pinned: true,
} as const;

export type NoteMeta = {
  noteType: NoteTypeValue;
  loanStage: LoanStageValue | null;
  tags: string[];
  followUpAt: Date | null;
  pinned: boolean;
};

export type NoteListItem = NoteMeta & {
  id: string;
  title: string;
  contentText: string;
  updatedAt: Date;
  createdAt: Date;
};

export async function listNotes(
  userId: string,
  filters: NoteFilters,
  now: Date = new Date(),
): Promise<NoteListItem[]> {
  return db.note.findMany({
    where: buildNoteWhere(userId, filters, now),
    orderBy: buildNoteOrderBy(filters.sort),
    select: {
      id: true,
      title: true,
      contentText: true,
      updatedAt: true,
      createdAt: true,
      ...metaSelect,
    },
    take: LIST_LIMIT,
  });
}

export type NoteFacets = {
  /** All of the broker's notes (unfiltered). */
  total: number;
  /** Follow-ups due today or overdue. */
  dueCount: number;
  /** Distinct tags across the broker's notes, A–Z, for the tag filter + suggestions. */
  tags: string[];
};

export async function getNoteFacets(userId: string, now: Date = new Date()): Promise<NoteFacets> {
  const base = { userId, deletedAt: null };
  const [total, dueCount, tagRows] = await Promise.all([
    db.note.count({ where: base }),
    db.note.count({ where: { ...base, followUpAt: { lt: startOfNextZonedDay(now) } } }),
    db.note.findMany({
      where: { ...base, NOT: { tags: { isEmpty: true } } },
      select: { tags: true },
    }),
  ]);
  const tags = [...new Set(tagRows.flatMap((r) => r.tags))].sort((a, b) =>
    a.localeCompare(b, "en-AU", { sensitivity: "base" }),
  );
  return { total, dueCount, tags };
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
      ...metaSelect,
    },
  });
  if (!note) return null;
  return { ...note, contentJson: isDocJson(note.contentJson) ? note.contentJson : EMPTY_DOC };
}
