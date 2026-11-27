import "server-only";

import type {
  ClientDetailDto,
  ClientListItemDto,
  NoteDetailDto,
  NoteFacetsDto,
  NoteListItemDto,
  NotesListDto,
} from "@broker-notes/shared/dto";
import { filtersToSearchParams, type NoteFilters } from "@broker-notes/shared/notes/filters";

import { apiGet } from "./server";

/**
 * Typed reads used by server components. The API scopes everything to the broker in the
 * session cookie, so there's no user id to pass — and nothing a page could get wrong.
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
