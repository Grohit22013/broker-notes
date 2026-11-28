"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { FormField } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { PASSWORD_MIN } from "@broker-notes/shared/auth/constants";
import type { RegisterInput } from "@broker-notes/shared/auth/validation";
import { registerAction, type AuthFormState } from "@/lib/api/auth-actions";

const initialState: AuthFormState<RegisterInput> = {};

/** When joining by invite the email is fixed and no brokerage is created. */
export type RegisterInvite = { token: string; email: string };

export function RegisterForm({ invite }: { invite?: RegisterInvite }) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {invite ? <input type="hidden" name="inviteToken" value={invite.token} /> : null}
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
        readOnly={Boolean(invite)}
        hint={invite ? "This invite is for this email address." : undefined}
        defaultValue={invite?.email ?? state.values?.email}
        error={state.fieldErrors?.email}
      />
      {invite ? null : (
        <FormField
          label="Brokerage name (optional)"
          name="organisationName"
          autoComplete="organization"
          placeholder="e.g. Harbour Home Loans"
          hint="You'll be its admin and can invite advisers and case managers."
          defaultValue={state.values?.organisationName}
          error={state.fieldErrors?.organisationName}
        />
      )}
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

      <SubmitButton pending={pending} pendingText={invite ? "Joining…" : "Creating account…"}>
        {invite ? "Join brokerage" : "Create account"}
      </SubmitButton>
    </form>
  );
}
