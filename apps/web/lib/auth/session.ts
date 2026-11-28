import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySession, type SessionClaims } from "./jwt";

export type CurrentUser = SessionClaims;

/**
 * The signed-in broker (from the API-issued session JWT), or null. Memoised per request.
 * Used for rendering (header, redirects); the API is the authority for data access.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
});

/** Use in server components that must have a user; redirects to /login otherwise. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
