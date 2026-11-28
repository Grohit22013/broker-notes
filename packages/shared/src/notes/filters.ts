import { z } from "zod";

import { startOfNextZonedDay } from "../dates";

import {
  DEFAULT_SORT,
  SEARCH_MAX,
  activeFilterCount,
  filtersToSearchParams,
  hasAnyFilter,
  type NoteFilters,
} from "./filter-utils";
import { LOAN_STAGE_VALUES, NOTE_TYPE_VALUES, type SortValue } from "./taxonomy";

// Re-exported so existing imports keep working.
export { DEFAULT_SORT, SEARCH_MAX, activeFilterCount, filtersToSearchParams, hasAnyFilter };
export type { NoteFilters };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Lenient: unknown or malformed params are ignored rather than erroring (URLs get hand-edited). */
const filtersSchema = z.object({
  q: z.preprocess(first, z.string().trim().max(SEARCH_MAX).catch("")).default(""),
  stage: z.preprocess(first, z.enum(LOAN_STAGE_VALUES).optional().catch(undefined)),
  type: z.preprocess(first, z.enum(NOTE_TYPE_VALUES).optional().catch(undefined)),
  tag: z.preprocess(first, z.string().trim().min(1).max(30).optional().catch(undefined)),
  client: z.preprocess(first, z.cuid().optional().catch(undefined)),
  due: z.preprocess(first, z.literal("1").optional().catch(undefined)).transform((v) => v === "1"),
  mine: z.preprocess(first, z.literal("1").optional().catch(undefined)).transform((v) => v === "1"),
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
    mine: parsed.mine,
    sort: parsed.sort,
  };
}

/** Who is asking: notes are scoped to their organisation; "mine" narrows to their own. */
export type NoteScope = { organisationId: string; userId: string };

/**
 * Prisma `where` for a brokerage's notes. Always scoped to the organisation and excludes deleted
 * notes — filters can only ever narrow that set.
 */
export function buildNoteWhere(scope: NoteScope, f: NoteFilters, now: Date = new Date()) {
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

  if (f.mine) and.push({ userId: scope.userId });

  return {
    organisationId: scope.organisationId,
    deletedAt: null,
    ...(and.length ? { AND: and } : {}),
  };
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
