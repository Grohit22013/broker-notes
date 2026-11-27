import { jwtVerify } from "jose";

/** Must match the API's cookie name (apps/api/src/config.ts). */
export const SESSION_COOKIE = "bn_session";

export type SessionClaims = { id: string; name: string; email: string };

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
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
    };
  } catch {
    return null;
  }
}
