/**
 * Sign-in / sign-up / sign-out against the NestJS API, shaped for `useActionState`.
 * Kept separate from lib/api/actions.ts, and the Zod schemas are loaded lazily on submit,
 * so validation code never lands in the bundle of every page that uses the other actions.
 */
import type { FieldErrors, LoginInput, RegisterInput } from "@broker-notes/shared/auth/validation";
import type { AuthUserDto } from "@broker-notes/shared/dto";

import { safeRedirect } from "@/lib/auth/redirect";

import { api } from "./client";

export type AuthFormState<T> = {
  /** Form-level error (e.g. wrong credentials). */
  error?: string;
  fieldErrors?: FieldErrors<T>;
  /** Echoed back so the form keeps what the user typed (never the password). */
  values?: { name?: string; email?: string; organisationName?: string };
};

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
const schemas = () => import("@broker-notes/shared/auth/validation");

/** Full navigation after sign-in/out so server components re-render with the new session. */
function go(path: string) {
  window.location.assign(path);
}

export async function registerAction(
  _prev: AuthFormState<RegisterInput>,
  formData: FormData,
): Promise<AuthFormState<RegisterInput>> {
  const raw = {
    name: str(formData.get("name")),
    email: str(formData.get("email")),
    password: str(formData.get("password")),
    confirmPassword: str(formData.get("confirmPassword")),
    organisationName: str(formData.get("organisationName")),
    inviteToken: str(formData.get("inviteToken")),
  };
  const values = { name: raw.name, email: raw.email, organisationName: raw.organisationName };
  // Same schema as the API: every field's error at once, without a round-trip.
  const { registerSchema, toFieldErrors } = await schemas();
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error), values };

  const res = await api<AuthUserDto>("POST", "/auth/register", parsed.data);
  if (!res.ok) {
    return res.field
      ? { fieldErrors: { [res.field]: res.error } as FieldErrors<RegisterInput>, values }
      : { error: res.error, values };
  }
  go("/dashboard");
  return {};
}

export async function loginAction(
  _prev: AuthFormState<LoginInput>,
  formData: FormData,
): Promise<AuthFormState<LoginInput>> {
  const raw = { email: str(formData.get("email")), password: str(formData.get("password")) };
  const values = { email: raw.email };
  const { loginSchema, toFieldErrors } = await schemas();
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error), values };

  const res = await api<AuthUserDto>("POST", "/auth/login", parsed.data);
  if (!res.ok) return { error: res.error, values };
  go(safeRedirect(formData.get("callbackUrl")));
  return {};
}

export async function logoutAction(): Promise<void> {
  await api("POST", "/auth/logout");
  go("/login");
}
