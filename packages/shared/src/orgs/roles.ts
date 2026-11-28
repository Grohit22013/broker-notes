/**
 * Organisation roles and what each may do. Zod-free and pure, so the API (enforcement) and the
 * web app (hiding/disabling controls) share exactly the same rules.
 *
 * Personas follow the product research: an Admin (brokerage manager), Advisers (work with
 * clients) and Case Managers (support advisers: lender updates, outstanding documents).
 */
export const ROLES = [
  {
    value: "ADMIN",
    label: "Admin",
    description: "Manages the team, brokerage settings and audit log. Can edit any note.",
  },
  {
    value: "ADVISER",
    label: "Adviser",
    description: "Works with clients: creates notes and client records, edits their own notes.",
  },
  {
    value: "CASE_MANAGER",
    label: "Case manager",
    description: "Supports advisers: reads the brokerage's notes and writes their own updates.",
  },
] as const;

export type RoleValue = (typeof ROLES)[number]["value"];
export const ROLE_VALUES = ROLES.map((r) => r.value) as [RoleValue, ...RoleValue[]];

export function roleLabel(role: RoleValue): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

/** The signed-in member, as far as permissions are concerned. */
export type Actor = { id: string; role: RoleValue };

/** Everyone in the brokerage can read its notes; only the author or an admin may change one. */
export function canEditNote(actor: Actor, authorId: string): boolean {
  return actor.role === "ADMIN" || actor.id === authorId;
}

/** Creating, editing and importing client records. */
export function canManageClients(actor: Actor): boolean {
  return actor.role === "ADMIN" || actor.role === "ADVISER";
}

/** Bulk CSV export of the brokerage's notes or clients. */
export function canExport(actor: Actor): boolean {
  return actor.role === "ADMIN" || actor.role === "ADVISER";
}

/** Invites, roles, deactivation, the brokerage name, and the audit log. */
export function canManageTeam(actor: Actor): boolean {
  return actor.role === "ADMIN";
}

/** Invite links are single-use and expire after this many days. */
export const INVITE_TTL_DAYS = 7;

export type MemberState = { id: string; role: RoleValue; active: boolean };

/**
 * Why a membership change isn't allowed, or null if it is. A brokerage must always keep at least
 * one active admin, otherwise nobody could manage it again.
 */
export function memberChangeProblem(
  members: readonly MemberState[],
  targetId: string,
  change: { role?: RoleValue; active?: boolean },
): string | null {
  const target = members.find((m) => m.id === targetId);
  if (!target) return "Member not found";
  const after = { ...target, ...change };
  const wasActiveAdmin = target.active && target.role === "ADMIN";
  const staysActiveAdmin = after.active && after.role === "ADMIN";
  if (wasActiveAdmin && !staysActiveAdmin) {
    const others = members.filter((m) => m.id !== targetId && m.active && m.role === "ADMIN");
    if (others.length === 0) {
      return "A brokerage needs at least one active admin. Make someone else an admin first.";
    }
  }
  return null;
}
