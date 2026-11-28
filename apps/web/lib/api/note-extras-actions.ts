/** Browser-side calls for favourites and brokerage templates. */
import type { OrgTemplateDto } from "@broker-notes/shared/dto";
import type { CreateOrgTemplateInput } from "@broker-notes/shared/notes/validation";

import { api } from "./client";

type Fail = { ok: false; error: string; field?: string };

export async function setFavouriteAction(
  noteId: string,
  favourite: boolean,
): Promise<{ ok: true } | Fail> {
  const res = await api<void>(
    favourite ? "PUT" : "DELETE",
    `/notes/${encodeURIComponent(noteId)}/favourite`,
  );
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function createTemplateAction(
  input: CreateOrgTemplateInput,
): Promise<{ ok: true; template: OrgTemplateDto } | Fail> {
  const res = await api<OrgTemplateDto>("POST", "/templates", input);
  return res.ok
    ? { ok: true, template: res.data }
    : { ok: false, error: res.error, ...(res.field ? { field: res.field } : {}) };
}

export async function removeTemplateAction(id: string): Promise<{ ok: true } | Fail> {
  const res = await api<void>("DELETE", `/templates/${encodeURIComponent(id)}`);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
