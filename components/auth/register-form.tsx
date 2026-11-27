"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { FormField } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { PASSWORD_MIN } from "@/lib/auth/constants";
import type { RegisterInput } from "@/lib/auth/validation";
import { registerAction, type AuthFormState } from "@/server/auth-actions";

const initialState: AuthFormState<RegisterInput> = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
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
        label="Full name"
        name="name"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <FormField
        label="Work email"
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
        autoComplete="new-password"
        required
        hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}
        error={state.fieldErrors?.password}
      />
      <FormField
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />

      <SubmitButton pending={pending} pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
