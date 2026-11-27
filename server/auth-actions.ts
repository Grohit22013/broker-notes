"use server";

import { Prisma } from "@prisma/client";
import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { hashPassword } from "@/lib/auth/password";
import { safeRedirect } from "@/lib/auth/redirect";
import {
  loginSchema,
  registerSchema,
  toFieldErrors,
  type FieldErrors,
  type LoginInput,
  type RegisterInput,
} from "@/lib/auth/validation";
import { db } from "@/lib/db";

export type AuthFormState<T> = {
  /** Form-level error (e.g. wrong credentials). */
  error?: string;
  fieldErrors?: FieldErrors<T>;
  /** Echoed back so the form keeps what the user typed (never the password). */
  values?: { name?: string; email?: string };
};

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export async function registerAction(
  _prev: AuthFormState<RegisterInput>,
  formData: FormData,
): Promise<AuthFormState<RegisterInput>> {
  const raw = {
    name: str(formData.get("name")),
    email: str(formData.get("email")),
    password: str(formData.get("password")),
    confirmPassword: str(formData.get("confirmPassword")),
  };
  const values = { name: raw.name, email: raw.email };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error), values };

  const { name, email, password } = parsed.data;

  try {
    await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        fieldErrors: { email: "An account with this email already exists. Try signing in." },
        values,
      };
    }
    console.error("registerAction: failed to create user", err);
    return { error: "Something went wrong creating your account. Please try again.", values };
  }

  // Sign the new broker straight in. On success this throws a redirect (handled by Next).
  await signIn("credentials", { email, password, redirectTo: "/notes" });
  return {};
}

export async function loginAction(
  _prev: AuthFormState<LoginInput>,
  formData: FormData,
): Promise<AuthFormState<LoginInput>> {
  const raw = { email: str(formData.get("email")), password: str(formData.get("password")) };
  const values = { email: raw.email };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error), values };

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: safeRedirect(formData.get("callbackUrl")),
    });
    return {};
  } catch (err) {
    // Wrong email/password → generic message (don't reveal which one was wrong).
    if (err instanceof AuthError) {
      return {
        error:
          err.type === "CredentialsSignin"
            ? "Incorrect email or password."
            : "Couldn't sign you in. Please try again.",
        values,
      };
    }
    throw err; // Re-throw Next.js redirect on success
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
