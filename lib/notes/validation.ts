import { z } from "zod";

import { parseIsoDate } from "@/lib/dates";

import { isDocJson, type DocJson } from "./content";
import { normalizeTags } from "./tags";
import { LOAN_STAGE_VALUES, NOTE_TYPE_VALUES } from "./taxonomy";

export const TITLE_MAX = 200;
/** Plain-text cap (~20k words) — far beyond any real file note. */
export const CONTENT_TEXT_MAX = 100_000;
/** Serialized JSON cap, protects the DB and server from oversized payloads. */
export const CONTENT_JSON_MAX_BYTES = 512 * 1024;

export const noteIdSchema = z.cuid({ error: "Invalid note id" });

const contentJson = z
  .custom<DocJson>(isDocJson, { error: "Content must be a Tiptap document" })
  .refine((doc) => new TextEncoder().encode(JSON.stringify(doc)).length <= CONTENT_JSON_MAX_BYTES, {
    error: "This note is too large to save",
  });

export const updateNoteSchema = z.object({
  id: noteIdSchema,
  title: z.string().max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer`),
  contentJson,
  contentText: z.string().max(CONTENT_TEXT_MAX, "This note is too long to save"),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

/**
 * Partial update of a note's details (everything except title/body). Omitted fields are
 * left unchanged; `null` clears loanStage / followUpDate.
 */
export const updateNoteMetaSchema = z.object({
  id: noteIdSchema,
  noteType: z.enum(NOTE_TYPE_VALUES).optional(),
  loanStage: z.enum(LOAN_STAGE_VALUES).nullable().optional(),
  tags: z
    .array(z.string().max(200))
    .max(50)
    .transform((t) => normalizeTags(t))
    .optional(),
  /** Calendar date in the broker's time zone, "YYYY-MM-DD". */
  followUpDate: z
    .string()
    .refine((v) => parseIsoDate(v) !== null, { error: "Enter a valid date" })
    .nullable()
    .optional(),
  pinned: z.boolean().optional(),
});

export type UpdateNoteMetaInput = z.input<typeof updateNoteMetaSchema>;
