/**
 * API contract: the JSON shapes the NestJS API returns and the Next.js web app consumes.
 * Dates are ISO-8601 strings on the wire.
 */
import type { Analysis } from "./ai/analysis";
import type { CaseStageValue, CaseTypeValue } from "./cases/taxonomy";
import type { TaskPriorityValue, TaskStatusValue } from "./tasks/taxonomy";
import type { RedactionCounts } from "./ai/redact";
import type { DocJson } from "./notes/content";
import type { NoteStatusValue } from "./notes/finalise";
import type { KeyFigures } from "./notes/key-figures";
import type { LoanStageValue, NoteTypeValue } from "./notes/taxonomy";
import type { RoleValue } from "./orgs/roles";

export type { RoleValue };

/** The signed-in member and their brokerage. */
export type AuthUserDto = {
  id: string;
  name: string;
  email: string;
  role: RoleValue;
  organisationId: string;
  organisationName: string;
};

/** A person reference (note author, assigned adviser, audit actor). */
export type UserRefDto = { id: string; name: string };

/** Error body for every non-2xx response. `field` names the input the message is about, if any. */
export type ApiErrorBody = {
  statusCode: number;
  message: string;
  field?: string;
  /** Machine-readable reason, e.g. "NOTE_CONFLICT". */
  code?: string;
  /** For NOTE_CONFLICT: the version that's now on the server. */
  latest?: NoteConflictDto;
};

/** The server's current version of a note, returned when a save would overwrite newer changes. */
export type NoteConflictDto = {
  revision: number;
  title: string;
  contentJson: DocJson;
  updatedAt: string;
  updatedBy: string | null;
};

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
  case: CaseRefDto | null;
};

export type NoteListItemDto = NoteMetaFieldsDto & {
  id: string;
  /** Who wrote the note — only they or an admin may change it. */
  author: UserRefDto;
  /** Starred by the signed-in member. */
  favourite: boolean;
  title: string;
  contentText: string;
  createdAt: string;
  updatedAt: string;
};

export type AmendmentDto = { id: string; body: string; createdAt: string };

export type NoteDetailDto = NoteListItemDto & {
  contentJson: DocJson;
  /** Increases with every content save; sent back as baseRevision to detect conflicts. */
  revision: number;
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
  caseId: string | null;
  caseReference: string | null;
  keyFigures: KeyFigures;
  status: NoteStatusValue;
};

export type SavedNoteDto = { updatedAt: string; revision: number };
export type CreatedNoteDto = { id: string };

export type VersionDto = { id: string; title: string; createdAt: string };
export type VersionDetailDto = { title: string; contentJson: DocJson };

export type ClientDto = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  assignedAdviser: UserRefDto | null;
};

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

// ── Organisations, roles & audit (Phase 8) ───────────────────────────────────

export type MemberDto = {
  id: string;
  name: string;
  email: string;
  role: RoleValue;
  active: boolean;
  joinedAt: string;
};

export type InviteDto = {
  id: string;
  email: string;
  role: RoleValue;
  createdAt: string;
  expiresAt: string;
  invitedBy: string;
  expired: boolean;
};

/** Returned once, when the invite is created — the token is never stored or shown again. */
export type CreatedInviteDto = InviteDto & { token: string };

export type OrganisationDto = {
  id: string;
  name: string;
  members: MemberDto[];
  /** Pending invites (admins only; empty for other roles). */
  invites: InviteDto[];
};

/** What an invite link shows before the invitee registers (public). */
export type InvitePreviewDto = {
  organisationName: string;
  email: string;
  role: RoleValue;
  invitedBy: string;
};

export type AuditEntryDto = {
  id: string;
  action: string;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: UserRefDto | null;
};

export type AuditPageDto = { items: AuditEntryDto[]; nextCursor: string | null };

// ── Mortgage cases & dashboard (Phase 9) ─────────────────────────────────────

export type { CaseStageValue, CaseTypeValue };

export type CaseRefDto = { id: string; reference: string };

/** For pickers: reference plus enough context to choose the right one. */
export type CaseOptionDto = CaseRefDto & {
  clientId: string;
  clientName: string;
  type: CaseTypeValue;
  stage: CaseStageValue;
};

export type CaseListItemDto = CaseRefDto & {
  type: CaseTypeValue;
  stage: CaseStageValue;
  lender: string | null;
  loanAmount: number | null;
  propertyValue: number | null;
  client: ClientRefDto;
  assignedAdviser: UserRefDto | null;
  noteCount: number;
  stageChangedAt: string;
  updatedAt: string;
};

export type CaseDetailDto = CaseListItemDto & {
  lenderReference: string | null;
  createdAt: string;
  createdBy: UserRefDto;
};

export type DashboardDto = {
  counts: {
    notes: number;
    myNotes: number;
    followUpsDue: number;
    openCases: number;
    myOpenCases: number;
    myOpenTasks: number;
    myOverdueTasks: number;
  };
  /** Open tasks assigned to the signed-in member, soonest due first. */
  myTasks: TaskDto[];
  pinned: NoteListItemDto[];
  recent: NoteListItemDto[];
  followUps: NoteListItemDto[];
  /** Open cases per stage, in pipeline order. */
  pipeline: { stage: CaseStageValue; count: number }[];
  /** Clients with the most recent note activity. */
  recentClients: (ClientRefDto & { lastNoteAt: string; noteCount: number })[];
};

// ── Follow-up tasks (Phase 10) ───────────────────────────────────────────────

export type { TaskPriorityValue, TaskStatusValue };

export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  /** "YYYY-MM-DD" in the brokerage's time zone. */
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: UserRefDto | null;
  createdBy: UserRefDto;
  note: { id: string; title: string } | null;
  client: ClientRefDto | null;
  case: CaseRefDto | null;
  /** Whether the signed-in member may change it (creator, assignee or admin). */
  canChange: boolean;
};

export type TaskBatchResultDto = { created: number; tasks: TaskDto[] };

// ── Editor & reliability (Phase 11) ──────────────────────────────────────────

/** One of the brokerage's own templates (built-ins live in notes/templates). */
export type OrgTemplateDto = {
  id: string;
  name: string;
  description: string | null;
  noteType: NoteTypeValue;
  createdBy: UserRefDto;
  createdAt: string;
  /** Creator or admin may remove it. */
  canRemove: boolean;
};
