/**
 * API contract: the JSON shapes the NestJS API returns and the Next.js web app consumes.
 * Dates are ISO-8601 strings on the wire.
 */
import type { Analysis } from "./ai/analysis";
import type { RedactionCounts } from "./ai/redact";
import type { DocJson } from "./notes/content";
import type { NoteStatusValue } from "./notes/finalise";
import type { KeyFigures } from "./notes/key-figures";
import type { LoanStageValue, NoteTypeValue } from "./notes/taxonomy";

export type AuthUserDto = { id: string; name: string; email: string };

/** Error body for every non-2xx response. `field` names the input the message is about, if any. */
export type ApiErrorBody = { statusCode: number; message: string; field?: string };

export type ClientRefDto = { id: string; name: string };

export type NoteMetaFieldsDto = {
  noteType: NoteTypeValue;
  loanStage: LoanStageValue | null;
  tags: string[];
  followUpAt: string | null;
  pinned: boolean;
  status: NoteStatusValue;
  keyFigures: KeyFigures;
  client: ClientRefDto | null;
};

export type NoteListItemDto = NoteMetaFieldsDto & {
  id: string;
  title: string;
  contentText: string;
  createdAt: string;
  updatedAt: string;
};

export type AmendmentDto = { id: string; body: string; createdAt: string };

export type NoteDetailDto = NoteListItemDto & {
  contentJson: DocJson;
  finalisedAt: string | null;
  amendments: AmendmentDto[];
};

export type NoteFacetsDto = { total: number; dueCount: number; tags: string[] };

export type NotesListDto = { items: NoteListItemDto[] };

/** Details as edited in the Details panel (follow-up as a calendar date). */
export type NoteMetaDto = {
  noteType: NoteTypeValue;
  loanStage: LoanStageValue | null;
  tags: string[];
  followUpDate: string | null; // "YYYY-MM-DD", Australia/Sydney
  pinned: boolean;
  clientId: string | null;
  clientName: string | null;
  keyFigures: KeyFigures;
  status: NoteStatusValue;
};

export type SavedNoteDto = { updatedAt: string };
export type CreatedNoteDto = { id: string };

export type VersionDto = { id: string; title: string; createdAt: string };
export type VersionDetailDto = { title: string; contentJson: DocJson };

export type ClientDto = { id: string; name: string; email: string | null; phone: string | null };

export type ClientListItemDto = ClientDto & { noteCount: number; lastNoteAt: string | null };

export type ClientDetailDto = ClientDto & { createdAt: string };

export type ImportProblemDto = { row: number; status: "invalid" | "duplicate"; reason: string };

export type ImportResultDto = {
  imported: number;
  duplicates: number;
  invalid: number;
  problems: ImportProblemDto[];
};

// ── AI (Phase 6) ─────────────────────────────────────────────────────────────

export type { Analysis, RedactionCounts };

export type AiStatusDto = {
  /** False when no OpenRouter key is configured on the server. */
  enabled: boolean;
  /** Primary model id (always a ":free" model). */
  model: string | null;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
};

export type NoteAnalysisDto = {
  analysis: Analysis;
  model: string;
  analysedAt: string;
  /** True when this result was reused because the note hasn't changed since. */
  cached: boolean;
  /** True when the note changed after this analysis (offer "Re-analyse"). */
  stale: boolean;
  /** What was removed before sending (only present on a fresh analysis). */
  redactions: RedactionCounts | null;
  remaining: number;
};
