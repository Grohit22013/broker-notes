import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { routeDecision } from "@/lib/auth/route-guard";

/** Page-level routing only — the API independently authorises every data request. */
export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = req.nextUrl;
  const decision = routeDecision(pathname, search, session !== null);
  if (decision.action === "redirect") return NextResponse.redirect(new URL(decision.to, req.url));
  return NextResponse.next();
}

export const config = {
  // Pages only: skip the API proxy, Next internals and static assets.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
