import type { JSONContent } from "@tiptap/react";

/** A Tiptap/ProseMirror JSON document (root node is always `doc`). Type-only import: no runtime cost. */
export type DocJson = JSONContent & { type: "doc" };

export const EMPTY_DOC: DocJson = { type: "doc", content: [{ type: "paragraph" }] };

export const UNTITLED = "Untitled note";

/** Runtime guard for JSON coming back from the database or the client. */
export function isDocJson(value: unknown): value is DocJson {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "doc" &&
    ((value as { content?: unknown }).content === undefined ||
      Array.isArray((value as { content?: unknown }).content))
  );
}

/**
 * Deep-copies editor JSON into plain objects. ProseMirror builds some `attrs` with a null
 * prototype; React's server-action serializer can't send those as data (it turns them into
 * opaque "temporary references"), so the server would fail to read the document.
 */
export function toPlainDoc(doc: JSONContent): DocJson {
  return JSON.parse(JSON.stringify(doc)) as DocJson;
}

/** Title to show for a note — falls back to "Untitled note" for blank titles. */
export function displayTitle(title: string): string {
  const t = title.trim();
  return t.length > 0 ? t : UNTITLED;
}

/** Collapses whitespace and truncates on a word boundary, e.g. for list-card previews. */
export function snippet(text: string, maxLength = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
