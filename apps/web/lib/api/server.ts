import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { SESSION_COOKIE } from "@/lib/auth/jwt";

/** Base URL of the NestJS API (server-side only — the browser goes through the /api proxy). */
export function apiBaseUrl(): string {
  return (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * GET from the API during server rendering, forwarding the broker's session cookie.
 * 401 → /session-ended (clears the cookie, then /login), 403 → ApiError, 404 → not-found UI
 * (another brokerage's id looks exactly like a missing one).
 */
export async function apiGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
    cache: "no-store",
  });
  if (res.status === 401) redirect("/session-ended");
  if (res.status === 404 || res.status === 400) notFound();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? `API error ${res.status}`);
  }
  return (await res.json()) as T;
}
