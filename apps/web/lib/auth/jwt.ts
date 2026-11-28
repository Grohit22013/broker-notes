import { jwtVerify } from "jose";
import { ROLE_VALUES, type RoleValue } from "@broker-notes/shared/orgs/roles";

/** Must match the API's cookie name (apps/api/src/config.ts). */
export const SESSION_COOKIE = "bn_session";

export type SessionClaims = {
  id: string;
  name: string;
  email: string;
  /** For showing/hiding controls only. Sessions from before roles existed read as "ADVISER". */
  role: RoleValue;
  organisationId: string;
  organisationName: string;
};

let key: Uint8Array | null = null;
function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set for the web app");
  return (key ??= new TextEncoder().encode(secret));
}

/**
 * Verifies the API-issued session JWT (HS256, shared AUTH_SECRET). Edge-safe (jose), so the
 * middleware can gate pages without a network round-trip. The API re-verifies on every request —
 * this check is for routing/UX only, never for authorising data access.
 */
export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      id: payload.sub,
      email: payload.email,
      name: str(payload.name) || payload.email,
      role: ROLE_VALUES.includes(payload.role as RoleValue)
        ? (payload.role as RoleValue)
        : "ADVISER",
      organisationId: str(payload.org),
      organisationName: str(payload.orgName),
    };
  } catch {
    return null;
  }
}
