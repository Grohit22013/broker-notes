/** Browser-side calls for mortgage cases. The API enforces who may change what. */
import type { CreateCaseInput } from "@broker-notes/shared/cases/validation";
import type { CaseDetailDto, CaseOptionDto, CaseStageValue } from "@broker-notes/shared/dto";

import { api } from "./client";

export type CaseResult =
  { ok: true; case: CaseDetailDto } | { ok: false; error: string; field?: string };

const toResult = (res: Awaited<ReturnType<typeof api<CaseDetailDto>>>): CaseResult =>
  res.ok
    ? { ok: true, case: res.data }
    : { ok: false, error: res.error, ...(res.field ? { field: res.field } : {}) };

export async function createCaseAction(input: CreateCaseInput): Promise<CaseResult> {
  return toResult(await api<CaseDetailDto>("POST", "/cases", input));
}

export async function updateCaseAction(
  id: string,
  input: Partial<Omit<CreateCaseInput, "clientId">>,
): Promise<CaseResult> {
  return toResult(await api<CaseDetailDto>("PATCH", `/cases/${encodeURIComponent(id)}`, input));
}

export function moveCaseStageAction(id: string, stage: CaseStageValue) {
  return updateCaseAction(id, { stage });
}

/** Cases for a picker (e.g. the note details panel), optionally for one client. */
export async function loadCaseOptions(clientId?: string): Promise<CaseOptionDto[]> {
  const res = await api<CaseOptionDto[]>(
    "GET",
    `/cases/options${clientId ? `?client=${encodeURIComponent(clientId)}` : ""}`,
  );
  return res.ok ? res.data : [];
}
