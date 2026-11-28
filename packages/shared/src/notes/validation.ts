import { z } from "zod";

import { parseIsoDate } from "../dates";

import { isDocJson, type DocJson } from "./content";
import { AMENDMENT_MAX } from "./finalise";
import { keyFiguresSchema } from "./key-figures";
import { normalizeTags } from "./tags";
import { LOAN_STAGE_VALUES, NOTE_TYPE_VALUES } from "./taxonomy";

import { CONTENT_JSON_MAX_BYTES, CONTENT_TEXT_MAX, TITLE_MAX } from "./limits";

export { CONTENT_JSON_MAX_BYTES, CONTENT_TEXT_MAX, TITLE_MAX };

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
  /**
   * The revision these edits were made on. If the note has moved on since (another tab or member
   * saved), the save is refused with 409 instead of overwriting their changes.
   */
  baseRevision: z.number().int().min(0).optional(),
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
  clientId: z.cuid({ error: "Invalid client" }).nullable().optional(),
  /** Linking a case also links its client. */
  caseId: z.cuid({ error: "Invalid case" }).nullable().optional(),
  keyFigures: keyFiguresSchema.nullable().optional(),
});

export type UpdateNoteMetaInput = z.input<typeof updateNoteMetaSchema>;

export const amendmentSchema = z.object({
  noteId: noteIdSchema,
  body: z
    .string()
    .trim()
    .min(1, "Write the amendment first")
    .max(AMENDMENT_MAX, `Amendments must be ${AMENDMENT_MAX} characters or fewer`),
});

export const noteTemplateSchema = z.object({
  /** A built-in template id, or the id (cuid) of one of the brokerage's own templates. */
  templateId: z.string().max(40).default("blank"),
  clientId: z.cuid().optional().catch(undefined),
  caseId: z.cuid().optional().catch(undefined),
});

/** Save a note's current structure as one of the brokerage's own templates. */
export const createOrgTemplateSchema = z.object({
  noteId: noteIdSchema,
  name: z
    .string({ error: "Give the template a name" })
    .trim()
    .min(2, "Give the template a name")
    .max(60, "Template names must be 60 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(200, "Descriptions must be 200 characters or fewer")
    .transform((v) => v || null)
    .nullable()
    .optional(),
  /** Default title; "{client}" becomes the client's name. */
  title: z.string().trim().max(120).optional(),
});

export type CreateOrgTemplateInput = z.input<typeof createOrgTemplateSchema>;
