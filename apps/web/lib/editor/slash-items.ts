/**
 * The "/" command menu's items. Pure data + filtering (unit-tested); the editor extension maps
 * each id to a Tiptap command.
 */
export type SlashItemId =
  "h1" | "h2" | "h3" | "bullets" | "numbers" | "checklist" | "table" | "quote" | "divider";

export type SlashItem = {
  id: SlashItemId;
  title: string;
  description: string;
  /** Extra words that should match (brokers type "todo", "conditions", "compare"…). */
  keywords: string[];
};

export const SLASH_ITEMS: readonly SlashItem[] = [
  {
    id: "h2",
    title: "Heading",
    description: "Section heading",
    keywords: ["title", "section", "h2"],
  },
  { id: "h3", title: "Subheading", description: "Smaller heading", keywords: ["h3", "sub"] },
  { id: "h1", title: "Large heading", description: "Top-level heading", keywords: ["h1", "big"] },
  {
    id: "checklist",
    title: "Checklist",
    description: "Conditions, documents, next steps",
    keywords: ["todo", "task", "check", "conditions", "documents"],
  },
  { id: "bullets", title: "Bulleted list", description: "Simple list", keywords: ["ul", "list"] },
  {
    id: "numbers",
    title: "Numbered list",
    description: "Ordered steps",
    keywords: ["ol", "steps"],
  },
  {
    id: "table",
    title: "Table",
    description: "Compare lenders, rates and fees",
    keywords: ["compare", "comparison", "grid", "lenders", "rates"],
  },
  {
    id: "quote",
    title: "Quote",
    description: "What the client said",
    keywords: ["blockquote", "said"],
  },
  {
    id: "divider",
    title: "Divider",
    description: "Horizontal line",
    keywords: ["hr", "line", "rule"],
  },
];

/** Items whose title or keywords start with (or contain) the typed query, best matches first. */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...SLASH_ITEMS];
  const score = (item: SlashItem) => {
    const words = [item.title.toLowerCase(), ...item.keywords];
    if (words.some((w) => w.startsWith(q))) return 2;
    if (words.some((w) => w.includes(q))) return 1;
    return 0;
  };
  return SLASH_ITEMS.map((item) => ({ item, s: score(item) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.item);
}
