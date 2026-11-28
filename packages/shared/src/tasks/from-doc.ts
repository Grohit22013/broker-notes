/**
 * Turns a note's checklist into task titles. Zod-free and pure (used in the browser).
 */
import type { JSONContent } from "../notes/json-content";

import { TASK_BATCH_MAX, TASK_TITLE_MAX } from "./taxonomy";

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  // Nested lists inside an item are their own items, not part of this title.
  return (node.content ?? [])
    .filter((c) => c.type !== "taskList" && c.type !== "bulletList" && c.type !== "orderedList")
    .map(textOf)
    .join(" ");
}

/**
 * The text of every *unticked* checklist item in the document, in order, trimmed, de-duplicated
 * (case-insensitively), capped at the title length and the batch size.
 */
export function openChecklistItems(doc: JSONContent): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === "taskItem" && !node.attrs?.checked) {
      const title = textOf(node).replace(/\s+/g, " ").trim().slice(0, TASK_TITLE_MAX);
      const key = title.toLowerCase();
      if (title && !seen.has(key)) {
        seen.add(key);
        out.push(title);
      }
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return out.slice(0, TASK_BATCH_MAX);
}
