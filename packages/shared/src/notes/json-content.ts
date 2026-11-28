/**
 * ProseMirror / Tiptap JSON node shape. Structurally identical to Tiptap's own `JSONContent`
 * (including its loose index signature), so the editor accepts it — without making the shared
 * package (and the API) depend on Tiptap.
 */
export type JSONContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  marks?: { type: string; attrs?: Record<string, unknown>; [key: string]: unknown }[];
  text?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors Tiptap's JSONContent
  [key: string]: any;
};
