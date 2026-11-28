import { z } from "zod";

import { emailSchema } from "../auth/validation";

import { AUDIT_CATEGORY_VALUES } from "./audit";
import { ROLE_VALUES } from "./roles";

const role = z.enum(ROLE_VALUES, { error: "Choose a role" });

export const memberIdSchema = z.cuid({ error: "Invalid member" });
export const inviteIdSchema = z.cuid({ error: "Invalid invite" });

/** Invite tokens are 32 random bytes, base64url-encoded (43 characters). */
export const inviteTokenSchema = z
  .string({ error: "Invalid invite link" })
  .regex(/^[A-Za-z0-9_-]{43}$/, "Invalid invite link");

export const organisationNameSchema = z
  .string({ error: "Brokerage name is required" })
  .trim()
  .min(2, "Brokerage name must be at least 2 characters")
  .max(80, "Brokerage name must be 80 characters or fewer");

export const renameOrganisationSchema = z.object({ name: organisationNameSchema });

export const createInviteSchema = z.object({ email: emailSchema, role });

export const updateMemberSchema = z
  .object({ role: role.optional(), active: z.boolean().optional() })
  .refine((v) => v.role !== undefined || v.active !== undefined, {
    error: "Nothing to change",
  });

/** Lenient: unknown values are ignored (URLs get hand-edited). */
export const auditQuerySchema = z.object({
  category: z.enum(AUDIT_CATEGORY_VALUES).optional().catch(undefined),
  cursor: z.cuid().optional().catch(undefined),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
