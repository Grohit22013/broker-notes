import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Edge middleware: only the lightweight config (JWT check), no database access.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on app pages; skip static assets, images and the auth API itself.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
