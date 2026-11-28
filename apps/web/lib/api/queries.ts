import "server-only";

import type {
  AuditPageDto,
  CaseDetailDto,
  CaseListItemDto,
  CaseOptionDto,
  CalendarDto,
  DashboardDto,
  OrgTemplateDto,
  TaskDto,
  ClientDetailDto,
  ClientListItemDto,
  NoteDetailDto,
  NoteFacetsDto,
  NoteListItemDto,
  NotesListDto,
  OrganisationDto,
  UserRefDto,
} from "@broker-notes/shared/dto";
import { filtersToSearchParams, type NoteFilters } from "@broker-notes/shared/notes/filters";

import { apiGet } from "./server";

/**
 * Typed reads used by server components. The API scopes everything to the member's brokerage
 * (from the session cookie), so there's no user or organisation id to pass — and nothing a page
 * could get wrong.
 */

export async function listNotes(filters: NoteFilters): Promise<NoteListItemDto[]> {
  const qs = filtersToSearchParams(filters).toString();
  return (await apiGet<NotesListDto>(`/notes${qs ? `?${qs}` : ""}`)).items;
}

export const getNoteFacets = () => apiGet<NoteFacetsDto>("/notes/facets");

export const getNote = (id: string) => apiGet<NoteDetailDto>(`/notes/${encodeURIComponent(id)}`);

export const clientOptions = () => apiGet<{ id: string; name: string }[]>("/clients/options");

export const listClients = (q = "") =>
  apiGet<ClientListItemDto[]>(`/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`);

export const getClient = (id: string) =>
  apiGet<ClientDetailDto>(`/clients/${encodeURIComponent(id)}`);

export const existingClientEmails = () => apiGet<string[]>("/clients/emails");

export const getOrganisation = () => apiGet<OrganisationDto>("/organisation");

export const getDashboard = () => apiGet<DashboardDto>("/dashboard");

/** Meetings, follow-ups and open tasks between two "YYYY-MM-DD" days. */
export const getCalendar = (from: string, to: string) =>
  apiGet<CalendarDto>(`/calendar?from=${from}&to=${to}`);

/** The brokerage's own note templates. */
export const orgTemplates = () => apiGet<OrgTemplateDto[]>("/templates");

/** Tasks, filtered like the /tasks page URL (status, assignee, due, note, client, case, q). */
export function listTasks(params: Record<string, string | undefined> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  return apiGet<TaskDto[]>(`/tasks${qs ? `?${qs}` : ""}`);
}

/** Cases, filtered like the /cases page URL (q, stage, client, status, mine). */
export function listCases(params: Record<string, string | undefined> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  return apiGet<CaseListItemDto[]>(`/cases${qs ? `?${qs}` : ""}`);
}

export const getCase = (id: string) => apiGet<CaseDetailDto>(`/cases/${encodeURIComponent(id)}`);

export const caseOptions = (clientId?: string) =>
  apiGet<CaseOptionDto[]>(
    `/cases/options${clientId ? `?client=${encodeURIComponent(clientId)}` : ""}`,
  );

/** Active members (for "assigned adviser" pickers). */
export const activeMembers = () => apiGet<UserRefDto[]>("/organisation/members");

export const getAuditPage = (category?: string) =>
  apiGet<AuditPageDto>(`/audit${category ? `?category=${encodeURIComponent(category)}` : ""}`);
