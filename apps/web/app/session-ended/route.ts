import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { safeRedirect } from "@/lib/auth/redirect";

/**
 * Where the app goes when the API rejects the session (expired, or the member was deactivated).
 * Clears the cookie *before* showing the sign-in page — otherwise the middleware would still see a
 * well-formed token, bounce /login back to /notes, and the API would bounce it back again.
 */
export function GET(req: NextRequest) {
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl");
  const params = new URLSearchParams({ ended: "1" });
  if (callbackUrl) params.set("callbackUrl", safeRedirect(callbackUrl));
  const res = NextResponse.redirect(new URL(`/login?${params.toString()}`, req.url));
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
}
