import { z } from "zod";

import { PASSWORD_MAX, PASSWORD_MIN } from "./constants";

export { PASSWORD_MAX, PASSWORD_MIN };

/** Lower-cased, trimmed email (also used for invites). */
export const emailSchema = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .pipe(z.email({ error: "Enter a valid email address" }));

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password is required")
    .max(PASSWORD_MAX, "Password is too long"),
});

export const registerSchema = z
  .object({
    name: z
      .string({ error: "Name is required" })
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(80, "Name must be 80 characters or fewer"),
    email: emailSchema,
    password: z
      .string({ error: "Password is required" })
      .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
      .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer`)
      .regex(/[A-Za-z]/, "Password must include a letter")
      .regex(/[0-9]/, "Password must include a number"),
    confirmPassword: z.string({ error: "Please confirm your password" }),
    /** New brokerage's name (ignored when joining by invite). Defaults to "<name>'s brokerage". */
    organisationName: z
      .string()
      .trim()
      .max(80, "Brokerage name must be 80 characters or fewer")
      .optional()
      .transform((v) => v || undefined),
    /** Token from an invite link: joins that brokerage instead of creating one. */
    inviteToken: z
      .string()
      .max(100)
      .optional()
      .transform((v) => v || undefined),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

/** Field-level error map suitable for rendering next to inputs. */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function toFieldErrors<T>(error: z.ZodError<T>): FieldErrors<T> {
  const out: FieldErrors<T> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof T | undefined;
    if (key !== undefined && out[key] === undefined) out[key] = issue.message;
  }
  return out;
}
