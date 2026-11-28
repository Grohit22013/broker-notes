import type { ApiErrorBody } from "@broker-notes/shared/dto";

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: string; field?: string; status: number };

/**
 * Browser → API call through the same-origin `/api` proxy (next.config rewrites), so the
 * httpOnly session cookie travels automatically and there's no CORS to configure.
 * Never throws: network problems come back as `{ ok: false }` for the UI to show.
 */
export async function api<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Check your connection." };
  }

  if (res.status === 204) return { ok: true, data: undefined as T };
  const json = (await res.json().catch(() => null)) as unknown;
  if (res.ok) return { ok: true, data: json as T };

  const err = json as Partial<ApiErrorBody> | null;
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    // Session expired mid-use: send the broker to sign in, then back here.
    const back = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }
  return {
    ok: false,
    status: res.status,
    error:
      err?.message ??
      (res.status === 429 ? "Too many attempts. Please wait a minute." : "Something went wrong."),
    ...(err?.field ? { field: err.field } : {}),
  };
}
