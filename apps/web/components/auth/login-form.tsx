"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { FormField } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { loginAction, type AuthFormState } from "@/lib/api/auth-actions";
import type { LoginInput } from "@broker-notes/shared/auth/validation";

const initialState: AuthFormState<LoginInput> = {};

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}

      {state.error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </div>
      ) : null}

      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      <SubmitButton pending={pending} pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
