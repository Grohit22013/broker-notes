import { z } from "zod";

import { startOfNextZonedDay } from "@/lib/dates";

import { LOAN_STAGE_VALUES, NOTE_TYPE_VALUES, type SortValue } from "./taxonomy";

/** Filters for the notes list, read from (and written to) the URL query string. */
export type NoteFilters = {
  q: string;
  stage?: (typeof LOAN_STAGE_VALUES)[number];
  type?: (typeof NOTE_TYPE_VALUES)[number];
  tag?: string;
  /** Only notes linked to this client (cuid). */
  client?: string;
  /** Only notes whose follow-up is today or overdue. */
  due: boolean;
  sort: SortValue;
};

export const DEFAULT_SORT: SortValue = "updated";
export const SEARCH_MAX = 100;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Lenient: unknown or malformed params are ignored rather than erroring (URLs get hand-edited). */
const filtersSchema = z.object({
  q: z.preprocess(first, z.string().trim().max(SEARCH_MAX).catch("")).default(""),
  stage: z.preprocess(first, z.enum(LOAN_STAGE_VALUES).optional().catch(undefined)),
  type: z.preprocess(first, z.enum(NOTE_TYPE_VALUES).optional().catch(undefined)),
  tag: z.preprocess(first, z.string().trim().min(1).max(30).optional().catch(undefined)),
  client: z.preprocess(first, z.cuid().optional().catch(undefined)),
  due: z.preprocess(first, z.literal("1").optional().catch(undefined)).transform((v) => v === "1"),
  sort: z.preprocess(
    first,
    z.enum(["updated", "created", "followup", "title"]).catch(DEFAULT_SORT).default(DEFAULT_SORT),
  ),
});

export function parseNoteFilters(
  params: Record<string, string | string[] | undefined>,
): NoteFilters {
  const parsed = filtersSchema.parse(params);
  return {
    q: parsed.q.slice(0, SEARCH_MAX),
    stage: parsed.stage,
    type: parsed.type,
    tag: parsed.tag,
    client: parsed.client,
    due: parsed.due,
    sort: parsed.sort,
  };
}

/** Inverse of parseNoteFilters: only non-default values end up in the URL. */
export function filtersToSearchParams(filters: Partial<NoteFilters>): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q?.trim()) p.set("q", filters.q.trim());
  if (filters.stage) p.set("stage", filters.stage);
  if (filters.type) p.set("type", filters.type);
  if (filters.tag) p.set("tag", filters.tag);
  if (filters.client) p.set("client", filters.client);
  if (filters.due) p.set("due", "1");
  if (filters.sort && filters.sort !== DEFAULT_SORT) p.set("sort", filters.sort);
  return p;
}

/** Number of active filters (search and sort excluded) — shown on the mobile "Filters" button. */
export function activeFilterCount(f: NoteFilters): number {
  return [f.stage, f.type, f.tag, f.client, f.due || undefined].filter(Boolean).length;
}

export function hasAnyFilter(f: NoteFilters): boolean {
  return f.q.length > 0 || activeFilterCount(f) > 0;
}

/**
 * Prisma `where` for a broker's notes. Always scoped to the owner and excludes deleted notes —
 * filters can only ever narrow that set.
 */
export function buildNoteWhere(userId: string, f: NoteFilters, now: Date = new Date()) {
  const and: object[] = [];
  if (f.q) {
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" as const } },
        { contentText: { contains: f.q, mode: "insensitive" as const } },
        { client: { name: { contains: f.q, mode: "insensitive" as const } } },
      ],
    });
  }
  if (f.stage) and.push({ loanStage: f.stage });
  if (f.type) and.push({ noteType: f.type });
  if (f.tag) and.push({ tags: { has: f.tag } });
  if (f.client) and.push({ clientId: f.client });
  if (f.due) and.push({ followUpAt: { lt: startOfNextZonedDay(now) } });

  return { userId, deletedAt: null, ...(and.length ? { AND: and } : {}) };
}

/** Pinned notes always come first, then the chosen sort, then a stable tiebreaker. */
export function buildNoteOrderBy(sort: SortValue) {
  const primary =
    sort === "created"
      ? { createdAt: "desc" as const }
      : sort === "title"
        ? { title: "asc" as const }
        : sort === "followup"
          ? { followUpAt: { sort: "asc" as const, nulls: "last" as const } }
          : { updatedAt: "desc" as const };
  return [{ pinned: "desc" as const }, primary, { id: "asc" as const }];
}
