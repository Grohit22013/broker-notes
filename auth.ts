import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/auth/validation";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await db.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, passwordHash: true },
        });

        // Always run bcrypt, even for unknown emails, so response time doesn't leak which emails exist.
        const valid = await verifyPassword(password, user?.passwordHash ?? null);
        if (!user || !valid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
