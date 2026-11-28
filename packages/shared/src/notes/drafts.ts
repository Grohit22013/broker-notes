/**
 * Local draft recovery: the editor keeps a copy of unsaved edits in the browser so a crash, a
 * closed tab or a dropped connection never loses work. Zod-free and pure (used in the browser).
 */
import type { DocJson } from "./content";
import { jsonEqual } from "./versioning";

/** What the editor stores in localStorage while there are unsaved changes. */
export type LocalDraft = {
  title: string;
  contentJson: DocJson;
  /** The note revision the edits were made on top of. */
  baseRevision: number;
  /** When the draft was written (ISO). */
  savedAt: string;
};

export function draftStorageKey(noteId: string): string {
  return `bn:draft:${noteId}`;
}

/** Drafts older than this are ignored and cleaned up. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type DraftOffer =
  | { offer: false }
  /** `stale`: the note was saved elsewhere since the draft was taken. */
  | { offer: true; stale: boolean };

/**
 * Whether to offer restoring a local draft when a note opens. Only when the draft actually differs
 * from what the server has, and isn't too old.
 */
export function draftOffer(
  draft: LocalDraft | null,
  server: { title: string; contentJson: DocJson; revision: number },
  now: Date = new Date(),
): DraftOffer {
  if (!draft) return { offer: false };
  const age = now.getTime() - Date.parse(draft.savedAt);
  if (!Number.isFinite(age) || age > DRAFT_MAX_AGE_MS) return { offer: false };
  const same = draft.title === server.title && jsonEqual(draft.contentJson, server.contentJson);
  if (same) return { offer: false };
  return { offer: true, stale: draft.baseRevision < server.revision };
}

/** Parses a stored draft defensively (localStorage can hold anything). */
export function parseLocalDraft(raw: string | null): LocalDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<LocalDraft>;
    if (
      typeof d.title !== "string" ||
      typeof d.baseRevision !== "number" ||
      typeof d.savedAt !== "string" ||
      typeof d.contentJson !== "object" ||
      d.contentJson === null ||
      (d.contentJson as { type?: unknown }).type !== "doc"
    ) {
      return null;
    }
    return d as LocalDraft;
  } catch {
    return null;
  }
}
