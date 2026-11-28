/**
 * Locking rules for finalised notes (ASIC RG 273 — file notes must be contemporaneous and
 * not silently rewritten).
 *
 * Once FINALISED, the record itself is locked: title, body, note type, client and key figures.
 * Workflow fields stay editable because they describe what happens *next*, not what was recorded:
 * follow-up date, loan stage, tags and pin. Corrections go in as timestamped amendments.
 */

export type NoteStatusValue = "DRAFT" | "FINALISED";

export const WORKFLOW_FIELDS = ["followUpDate", "loanStage", "tags", "pinned"] as const;
export const LOCKED_FIELDS = ["noteType", "clientId", "caseId", "keyFigures"] as const;

type MetaField = (typeof WORKFLOW_FIELDS)[number] | (typeof LOCKED_FIELDS)[number];

export function canEditContent(status: NoteStatusValue): boolean {
  return status === "DRAFT";
}

/** Returns the first field in `patch` that a finalised note doesn't allow changing, if any. */
export function lockedFieldIn(
  status: NoteStatusValue,
  patchKeys: readonly string[],
): MetaField | null {
  if (status === "DRAFT") return null;
  const locked = patchKeys.find((k) => (LOCKED_FIELDS as readonly string[]).includes(k));
  return (locked as MetaField | undefined) ?? null;
}

export const AMENDMENT_MAX = 5000;
