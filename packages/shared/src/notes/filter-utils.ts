/**
 * Zod-free filter types and URL helpers — safe to import from browser code without pulling the
 * validation library into the bundle. Parsing (with Zod) lives in ./filters.
 */
import type { LOAN_STAGE_VALUES, NOTE_TYPE_VALUES, SortValue } from "./taxonomy";

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
  /** Only notes written by the signed-in member ("Created by me"). */
  mine: boolean;
  sort: SortValue;
};

export const DEFAULT_SORT: SortValue = "updated";
export const SEARCH_MAX = 100;

/** Inverse of parseNoteFilters: only non-default values end up in the URL. */
export function filtersToSearchParams(filters: Partial<NoteFilters>): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q?.trim()) p.set("q", filters.q.trim());
  if (filters.stage) p.set("stage", filters.stage);
  if (filters.type) p.set("type", filters.type);
  if (filters.tag) p.set("tag", filters.tag);
  if (filters.client) p.set("client", filters.client);
  if (filters.due) p.set("due", "1");
  if (filters.mine) p.set("mine", "1");
  if (filters.sort && filters.sort !== DEFAULT_SORT) p.set("sort", filters.sort);
  return p;
}

/** Number of active filters (search and sort excluded) — shown on the mobile "Filters" button. */
export function activeFilterCount(f: NoteFilters): number {
  return [f.stage, f.type, f.tag, f.client, f.due || undefined, f.mine || undefined].filter(Boolean)
    .length;
}

export function hasAnyFilter(f: NoteFilters): boolean {
  return f.q.length > 0 || activeFilterCount(f) > 0;
}
