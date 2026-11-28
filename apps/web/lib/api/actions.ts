/**
 * Browser-side calls to the NestJS API, with the same names and result shapes the components
 * used when these were Next.js Server Actions — so the UI didn't need to change shape.
 * All authorisation and validation happen in the API; these are thin, typed wrappers.
 */
import type { ClientInput, ColumnMapping } from "@broker-notes/shared/clients/validation";
import type {
  AiStatusDto,
  AmendmentDto,
  ClientDto,
  CreatedNoteDto,
  ImportProblemDto,
  NoteAnalysisDto,
  NoteConflictDto,
  NoteMetaDto,
  SavedNoteDto,
  VersionDetailDto,
  VersionDto,
} from "@broker-notes/shared/dto";
import type { DocJson } from "@broker-notes/shared/notes/content";
import type { KeyFigures } from "@broker-notes/shared/notes/key-figures";
import type { LoanStageValue, NoteTypeValue } from "@broker-notes/shared/notes/taxonomy";

import { api } from "./client";

export type { ClientDto, NoteMetaDto, VersionDto };

type Fail = { ok: false; error: string };

// ── Notes ────────────────────────────────────────────────────────────────────

export type SaveNoteResult =
  | { ok: true; updatedAt: string; revision: number }
  /** The note changed elsewhere since `baseRevision`: nothing was saved. */
  | { ok: false; error: string; conflict?: NoteConflictDto };

export async function saveNoteAction(input: {
  id: string;
  title: string;
  contentJson: DocJson;
  contentText: string;
  baseRevision?: number;
}): Promise<SaveNoteResult> {
  const { id, ...body } = input;
  const res = await api<SavedNoteDto>("PUT", `/notes/${id}/content`, body);
  if (res.ok) return { ok: true, updatedAt: res.data.updatedAt, revision: res.data.revision };
  return res.code === "NOTE_CONFLICT" && res.latest
    ? { ok: false, error: res.error, conflict: res.latest }
    : { ok: false, error: res.error };
}

export type UpdateNoteMetaInput = {
  id: string;
  noteType?: NoteTypeValue;
  loanStage?: LoanStageValue | null;
  tags?: string[];
  followUpDate?: string | null;
  meetingAt?: string | null;
  pinned?: boolean;
  clientId?: string | null;
  caseId?: string | null;
  keyFigures?: KeyFigures | null;
  /** UI-only fields the optimistic update carries along; not sent. */
  clientName?: string | null;
  caseReference?: string | null;
  status?: string;
};

export type SaveNoteMetaResult = { ok: true; meta: NoteMetaDto } | Fail;

export async function updateNoteMetaAction(
  input: UpdateNoteMetaInput,
): Promise<SaveNoteMetaResult> {
  const {
    id,
    clientName: _clientName,
    caseReference: _caseReference,
    status: _status,
    ...body
  } = input;
  const res = await api<NoteMetaDto>("PATCH", `/notes/${id}/meta`, body);
  return res.ok ? { ok: true, meta: res.data } : { ok: false, error: res.error };
}

/** Creates a note (optionally from a template, for a client); returns its id. */
export async function createNote(input: {
  templateId?: string;
  clientId?: string;
  caseId?: string;
}): Promise<{ ok: true; id: string } | Fail> {
  const res = await api<CreatedNoteDto>("POST", "/notes", input);
  return res.ok ? { ok: true, id: res.data.id } : { ok: false, error: res.error };
}

export async function finaliseNoteAction(id: string): Promise<{ ok: true } | Fail> {
  const res = await api<void>("POST", `/notes/${id}/finalise`);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export type AmendmentResult = { ok: true; amendment: AmendmentDto } | Fail;

export async function addAmendmentAction(input: {
  noteId: string;
  body: string;
}): Promise<AmendmentResult> {
  const res = await api<AmendmentDto>("POST", `/notes/${input.noteId}/amendments`, {
    body: input.body,
  });
  return res.ok ? { ok: true, amendment: res.data } : { ok: false, error: res.error };
}

export async function listVersionsAction(noteId: string): Promise<VersionDto[]> {
  const res = await api<VersionDto[]>("GET", `/notes/${noteId}/versions`);
  return res.ok ? res.data : [];
}

export async function getVersionAction(
  noteId: string,
  versionId: string,
): Promise<({ ok: true } & VersionDetailDto) | Fail> {
  const res = await api<VersionDetailDto>("GET", `/notes/${noteId}/versions/${versionId}`);
  return res.ok ? { ok: true, ...res.data } : { ok: false, error: res.error };
}

export async function snapshotNoteAction(noteId: string): Promise<{ ok: boolean }> {
  const res = await api<void>("POST", `/notes/${noteId}/versions`);
  return { ok: res.ok };
}

export async function deleteNoteAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await api<void>("DELETE", `/notes/${id}`);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

// ── Clients ──────────────────────────────────────────────────────────────────

export type ClientResult =
  | { ok: true; client: ClientDto }
  | { ok: false; error: string; field?: "name" | "email" | "phone" };

export async function createClientAction(input: ClientInput): Promise<ClientResult> {
  const res = await api<ClientDto>("POST", "/clients", input);
  return res.ok
    ? { ok: true, client: res.data }
    : { ok: false, error: res.error, field: res.field as "name" | "email" | "phone" | undefined };
}

export async function updateClientAction(id: string, input: ClientInput): Promise<ClientResult> {
  const res = await api<ClientDto>("PATCH", `/clients/${id}`, input);
  return res.ok
    ? { ok: true, client: res.data }
    : { ok: false, error: res.error, field: res.field as "name" | "email" | "phone" | undefined };
}

export type ImportResult =
  | {
      ok: true;
      imported: number;
      duplicates: number;
      invalid: number;
      problems: ImportProblemDto[];
    }
  | Fail;

export async function importClientsAction(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): Promise<ImportResult> {
  const res = await api<{
    imported: number;
    duplicates: number;
    invalid: number;
    problems: ImportProblemDto[];
  }>("POST", "/clients/import", { rows, mapping });
  return res.ok ? { ok: true, ...res.data } : { ok: false, error: res.error };
}

/** Form helper: reads `templateId` / `clientId` from a <form> and creates the note. */
export function createNoteFromForm(formData: FormData) {
  const templateId = formData.get("templateId");
  const clientId = formData.get("clientId");
  const caseId = formData.get("caseId");
  return createNote({
    ...(typeof templateId === "string" && templateId ? { templateId } : {}),
    ...(typeof clientId === "string" && clientId ? { clientId } : {}),
    ...(typeof caseId === "string" && caseId ? { caseId } : {}),
  });
}

// ── AI (free OpenRouter models via the API) ──────────────────────────────────

export async function getAiStatus(): Promise<AiStatusDto | null> {
  const res = await api<AiStatusDto>("GET", "/ai/status");
  return res.ok ? res.data : null;
}

export async function getLatestAnalysis(noteId: string): Promise<NoteAnalysisDto | null> {
  const res = await api<NoteAnalysisDto | null>("GET", `/notes/${noteId}/analysis`);
  return res.ok ? res.data : null;
}

export async function analyseNote(
  noteId: string,
  force = false,
): Promise<{ ok: true; result: NoteAnalysisDto } | Fail> {
  const res = await api<NoteAnalysisDto>("POST", `/notes/${noteId}/analysis`, { force });
  return res.ok ? { ok: true, result: res.data } : { ok: false, error: res.error };
}
