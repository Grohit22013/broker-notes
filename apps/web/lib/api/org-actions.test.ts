import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createInviteAction,
  inviteUrl,
  loadAuditPageAction,
  renameOrganisationAction,
  revokeInviteAction,
  updateMemberAction,
} from "./org-actions";

afterEach(() => vi.unstubAllGlobals());

/** Records each request and answers with the given status/body. */
function fakeFetch(status: number, body: unknown) {
  const calls: { method?: string; url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

describe("organisation actions", () => {
  it("call the right endpoints through the /api proxy", async () => {
    const calls = fakeFetch(200, { ok: 1 });
    await renameOrganisationAction("Harbour Home Loans");
    await updateMemberAction("cm1", { role: "ADVISER" });
    await createInviteAction({ email: "sam@example.com", role: "CASE_MANAGER" });
    expect(calls).toEqual([
      { method: "PATCH", url: "/api/organisation", body: { name: "Harbour Home Loans" } },
      { method: "PATCH", url: "/api/organisation/members/cm1", body: { role: "ADVISER" } },
      {
        method: "POST",
        url: "/api/organisation/invites",
        body: { email: "sam@example.com", role: "CASE_MANAGER" },
      },
    ]);
  });

  it("revokes invites and pages the audit log with an encoded cursor and category", async () => {
    const calls = fakeFetch(204, null);
    await expect(revokeInviteAction("inv/1")).resolves.toEqual({ ok: true, data: undefined });
    fakeFetch(200, { items: [], nextCursor: null });
    await loadAuditPageAction("team", "c1");
    await loadAuditPageAction(undefined, "c2");
    expect(calls[0]).toMatchObject({ method: "DELETE", url: "/api/organisation/invites/inv%2F1" });
    const urls = vi.mocked(fetch).mock.calls.map((c) => c[0]);
    expect(urls).toEqual(["/api/audit?cursor=c1&category=team", "/api/audit?cursor=c2"]);
  });

  it("passes API errors (with their field) back to the form", async () => {
    fakeFetch(409, { statusCode: 409, message: "Already a member", field: "email" });
    await expect(createInviteAction({ email: "a@b.co", role: "ADVISER" })).resolves.toEqual({
      ok: false,
      error: "Already a member",
      field: "email",
    });
    fakeFetch(403, { statusCode: 403, message: "Only brokerage admins can manage the team." });
    await expect(renameOrganisationAction("X Co")).resolves.toEqual({
      ok: false,
      error: "Only brokerage admins can manage the team.",
    });
  });

  it("builds invite links from the current origin", () => {
    vi.stubGlobal("window", { location: { origin: "https://brokernotes.example" } });
    expect(inviteUrl("abc_DEF-123")).toBe(
      "https://brokernotes.example/register?invite=abc_DEF-123",
    );
  });
});
