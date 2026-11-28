/**
 * Browser-side calls for the brokerage: team, invites and the audit log. The API enforces who may
 * do what (admins only for changes); the UI just hides what the viewer can't use.
 */
import type {
  AuditPageDto,
  CreatedInviteDto,
  MemberDto,
  OrganisationDto,
  RoleValue,
} from "@broker-notes/shared/dto";

import { api } from "./client";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

const wrap = async <T>(p: ReturnType<typeof api<T>>): Promise<Result<T>> => {
  const res = await p;
  return res.ok
    ? { ok: true, data: res.data }
    : { ok: false, error: res.error, ...(res.field ? { field: res.field } : {}) };
};

export const renameOrganisationAction = (name: string) =>
  wrap(api<OrganisationDto>("PATCH", "/organisation", { name }));

export const updateMemberAction = (id: string, change: { role?: RoleValue; active?: boolean }) =>
  wrap(api<MemberDto>("PATCH", `/organisation/members/${encodeURIComponent(id)}`, change));

export const createInviteAction = (input: { email: string; role: RoleValue }) =>
  wrap(api<CreatedInviteDto>("POST", "/organisation/invites", input));

export const revokeInviteAction = (id: string) =>
  wrap(api<void>("DELETE", `/organisation/invites/${encodeURIComponent(id)}`));

export function loadAuditPageAction(category: string | undefined, cursor: string) {
  const qs = new URLSearchParams({ cursor, ...(category ? { category } : {}) });
  return wrap(api<AuditPageDto>("GET", `/audit?${qs.toString()}`));
}

/** The link an invitee opens. Built from the current origin, so it works on any deployment. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/register?invite=${encodeURIComponent(token)}`;
}
