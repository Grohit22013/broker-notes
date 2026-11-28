/** Route prefixes that require a signed-in broker. */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/notes",
  "/cases",
  "/tasks",
  "/clients",
  "/settings",
] as const;
const AUTH_PAGES = ["/login", "/register"] as const;

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export type RouteDecision = { action: "next" } | { action: "redirect"; to: string };

/**
 * Pure routing rule used by the middleware:
 * - signed-out visits to protected pages → /login?callbackUrl=<relative path>
 * - signed-in visits to /login or /register → /dashboard
 * The callbackUrl is relative so `safeRedirect` (which rejects absolute URLs) accepts it.
 */
export function routeDecision(pathname: string, search: string, signedIn: boolean): RouteDecision {
  if (PROTECTED_PREFIXES.some((p) => matches(pathname, p))) {
    if (signedIn) return { action: "next" };
    const params = new URLSearchParams({ callbackUrl: `${pathname}${search}` });
    return { action: "redirect", to: `/login?${params.toString()}` };
  }
  if (signedIn && AUTH_PAGES.some((p) => matches(pathname, p))) {
    return { action: "redirect", to: "/dashboard" };
  }
  return { action: "next" };
}
