import type { JSONContent } from "./json-content";

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

/** Plain text → one line; block breaks (headings, list items) become " · " separators. */
function toOneLine(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
}

export type SnippetParts = { before: string; match: string; after: string };

/**
 * A preview centred on the first case-insensitive match of `query`, split so the match can be
 * highlighted. Returns null when there is no match (callers fall back to `snippet`).
 */
export function matchSnippet(text: string, query: string, maxLength = 160): SnippetParts | null {
  const clean = toOneLine(text);
  const q = query.trim();
  if (!q) return null;
  const at = clean.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return null;

  const room = Math.max(0, maxLength - q.length);
  let start = Math.max(0, at - Math.floor(room / 3));
  const end = Math.min(clean.length, start + q.length + room);
  start = Math.max(0, Math.min(start, end - maxLength));

  return {
    before: `${start > 0 ? "…" : ""}${clean.slice(start, at)}`,
    match: clean.slice(at, at + q.length),
    after: `${clean.slice(at + q.length, end)}${end < clean.length ? "…" : ""}`,
  };
}

/** Collapses whitespace and truncates on a word boundary, e.g. for list-card previews. */
export function snippet(text: string, maxLength = 160): string {
  const clean = toOneLine(text);
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
