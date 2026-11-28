import { describe, expect, it } from "vitest";

import {
  canEditNote,
  canExport,
  canManageClients,
  canManageTeam,
  memberChangeProblem,
  roleLabel,
  type MemberState,
} from "./roles";
import { categoryOf } from "./audit";
import { createInviteSchema, inviteTokenSchema, updateMemberSchema } from "./validation";

const admin = { id: "a", role: "ADMIN" as const };
const adviser = { id: "b", role: "ADVISER" as const };
const caseManager = { id: "c", role: "CASE_MANAGER" as const };

describe("permissions", () => {
  it("lets authors and admins edit a note, but not other members", () => {
    expect(canEditNote(adviser, "b")).toBe(true);
    expect(canEditNote(adviser, "a")).toBe(false);
    expect(canEditNote(caseManager, "b")).toBe(false);
    expect(canEditNote(admin, "b")).toBe(true);
  });

  it("keeps client management and export away from case managers", () => {
    expect([admin, adviser, caseManager].map(canManageClients)).toEqual([true, true, false]);
    expect([admin, adviser, caseManager].map(canExport)).toEqual([true, true, false]);
  });

  it("reserves team management for admins", () => {
    expect([admin, adviser, caseManager].map(canManageTeam)).toEqual([true, false, false]);
    expect(roleLabel("CASE_MANAGER")).toBe("Case manager");
  });
});

describe("memberChangeProblem", () => {
  const team: MemberState[] = [
    { id: "a", role: "ADMIN", active: true },
    { id: "b", role: "ADVISER", active: true },
  ];

  it("never leaves a brokerage without an active admin", () => {
    expect(memberChangeProblem(team, "a", { role: "ADVISER" })).toMatch(
      /at least one active admin/,
    );
    expect(memberChangeProblem(team, "a", { active: false })).toMatch(/at least one active admin/);
  });

  it("allows changes once another admin exists", () => {
    const two: MemberState[] = [...team, { id: "d", role: "ADMIN", active: true }];
    expect(memberChangeProblem(two, "a", { role: "ADVISER" })).toBeNull();
    expect(memberChangeProblem(team, "b", { role: "CASE_MANAGER" })).toBeNull();
    expect(memberChangeProblem(team, "b", { active: false })).toBeNull();
  });

  it("does not count a deactivated admin as a remaining admin", () => {
    const withInactive: MemberState[] = [...team, { id: "d", role: "ADMIN", active: false }];
    expect(memberChangeProblem(withInactive, "a", { role: "ADVISER" })).not.toBeNull();
    expect(memberChangeProblem(team, "zz", { role: "ADMIN" })).toBe("Member not found");
  });
});

describe("org validation", () => {
  it("normalises invite emails and requires a role", () => {
    expect(createInviteSchema.parse({ email: " Sam@Example.COM ", role: "ADVISER" })).toEqual({
      email: "sam@example.com",
      role: "ADVISER",
    });
    expect(createInviteSchema.safeParse({ email: "sam@example.com", role: "OWNER" }).success).toBe(
      false,
    );
  });

  it("accepts only well-formed invite tokens", () => {
    expect(inviteTokenSchema.safeParse("A".repeat(43)).success).toBe(true);
    expect(inviteTokenSchema.safeParse("A".repeat(42)).success).toBe(false);
    expect(inviteTokenSchema.safeParse("../../etc/passwd" + "A".repeat(27)).success).toBe(false);
  });

  it("rejects an empty member update", () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(false);
    expect(updateMemberSchema.safeParse({ active: false }).success).toBe(true);
  });

  it("maps audit actions to categories", () => {
    expect(categoryOf("note.finalised")).toBe("note");
    expect(categoryOf("clients.imported")).toBe("client");
    expect(categoryOf("member.role_changed")).toBe("team");
    expect(categoryOf("unknown.thing")).toBeNull();
  });
});
