import type { NextAuthConfig } from "next-auth";

/** Route prefixes that require a signed-in broker. */
export const PROTECTED_PREFIXES = ["/notes", "/clients"] as const;
const AUTH_PAGES = ["/login", "/register"] as const;

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Edge-safe Auth.js config (no Prisma / bcrypt imports) shared by `middleware.ts` and `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 }, // 7 days
  trustHost: true,
  providers: [], // Added in auth.ts (Credentials needs Node APIs)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const signedIn = Boolean(auth?.user);
      const { pathname } = nextUrl;

      if (PROTECTED_PREFIXES.some((p) => matches(pathname, p))) {
        if (signedIn) return true;
        // Build the redirect ourselves so callbackUrl is a *relative* path
        // (Auth.js's default uses an absolute URL, which safeRedirect rightly rejects).
        const login = new URL("/login", nextUrl);
        login.searchParams.set("callbackUrl", `${pathname}${nextUrl.search}`);
        return Response.redirect(login);
      }
      if (signedIn && AUTH_PAGES.some((p) => matches(pathname, p))) {
        return Response.redirect(new URL("/notes", nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
