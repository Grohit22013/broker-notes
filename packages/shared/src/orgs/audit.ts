/** Audit-log vocabulary shared by the API (writing) and the web app (filtering, labels). */
export const AUDIT_CATEGORIES = [
  { value: "note", label: "Notes", prefixes: ["note."] },
  { value: "client", label: "Clients", prefixes: ["client.", "clients."] },
  { value: "case", label: "Cases", prefixes: ["case."] },
  { value: "team", label: "Team & settings", prefixes: ["member.", "invite.", "organisation."] },
  { value: "export", label: "Exports", prefixes: ["export."] },
  { value: "ai", label: "AI assist", prefixes: ["ai."] },
  { value: "auth", label: "Sign-ins", prefixes: ["auth."] },
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]["value"];
export const AUDIT_CATEGORY_VALUES = AUDIT_CATEGORIES.map((c) => c.value) as [
  AuditCategory,
  ...AuditCategory[],
];

/** Every action the API records. */
export type AuditAction =
  | "auth.signed_in"
  | "organisation.created"
  | "organisation.renamed"
  | "member.invited"
  | "member.joined"
  | "member.role_changed"
  | "member.deactivated"
  | "member.reactivated"
  | "invite.revoked"
  | "note.created"
  | "note.details_updated"
  | "note.finalised"
  | "note.amended"
  | "note.version_restored"
  | "note.deleted"
  | "client.created"
  | "client.updated"
  | "clients.imported"
  | "case.created"
  | "case.updated"
  | "case.stage_changed"
  | "export.notes"
  | "export.clients"
  | "ai.analysed";

export function categoryOf(action: string): AuditCategory | null {
  return AUDIT_CATEGORIES.find((c) => c.prefixes.some((p) => action.startsWith(p)))?.value ?? null;
}

export function auditCategory(value: AuditCategory) {
  return AUDIT_CATEGORIES.find((c) => c.value === value)!;
}

export const AUDIT_PAGE_SIZE = 50;
