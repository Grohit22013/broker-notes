/**
 * Autosave fires every ~1.5s while typing, so snapshotting on every save would flood the
 * history. Instead we keep at most one snapshot per window: a new version is recorded when
 * the content changed AND the latest snapshot is older than the window (or none exists).
 */
export const VERSION_WINDOW_MS = 5 * 60 * 1000;

export function shouldSnapshot({
  lastVersionAt,
  now,
  changed,
  windowMs = VERSION_WINDOW_MS,
}: {
  lastVersionAt: Date | null;
  now: Date;
  changed: boolean;
  windowMs?: number;
}): boolean {
  if (!changed) return false;
  if (!lastVersionAt) return true;
  return now.getTime() - lastVersionAt.getTime() >= windowMs;
}

/** Stable comparison of two JSON values (key order independent for objects). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
