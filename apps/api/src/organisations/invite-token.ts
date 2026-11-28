import { createHash, randomBytes } from "node:crypto";

/** A new invite token: 32 random bytes as base64url (43 chars). Only its hash is stored. */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
