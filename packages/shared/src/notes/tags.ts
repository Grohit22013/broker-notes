export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** Trims, collapses inner whitespace and caps the length of one tag. Returns "" if empty. */
export function cleanTag(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
}

/**
 * Normalises a tag list: cleans each tag, drops empties, removes case-insensitive duplicates
 * (first spelling wins) and keeps at most MAX_TAGS.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = cleanTag(raw);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** Splits user input like "refinance, first home buyer" into tags. */
export function parseTagInput(input: string): string[] {
  return input.split(/[,\n]/);
}
