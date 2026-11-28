import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, UsersRound } from "lucide-react";

import { RegisterForm } from "@/components/auth/register-form";
import { apiBaseUrl } from "@/lib/api/server";
import type { InvitePreviewDto } from "@broker-notes/shared/dto";
import { roleLabel } from "@broker-notes/shared/orgs/roles";

export const metadata: Metadata = { title: "Create account" };

type Props = { searchParams: Promise<{ invite?: string | string[] }> };

/** Public invite lookup. Null when the link is invalid, used, revoked or expired. */
async function previewInvite(token: string): Promise<InvitePreviewDto | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const res = await fetch(`${apiBaseUrl()}/invites/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as InvitePreviewDto) : null;
  } catch {
    return null;
  }
}

export default async function RegisterPage({ searchParams }: Props) {
  const raw = (await searchParams).invite;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const invite = token ? await previewInvite(token) : null;

  return (
    <div className="space-y-8">
      {invite && token ? (
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Join {invite.organisationName}</h1>
          <p className="text-muted-foreground flex items-start gap-2 text-sm">
            <UsersRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {invite.invitedBy} invited you as{" "}
              <strong className="text-foreground">{roleLabel(invite.role)}</strong>. Create your
              account to get started.
            </span>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-muted-foreground text-sm">
            Set up your brokerage and keep compliant, searchable file notes for every client.
          </p>
        </div>
      )}

      {token && !invite ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          This invite link is invalid or has expired. Ask your brokerage admin for a new one, or
          create a new brokerage below.
        </div>
      ) : null}

      <RegisterForm invite={invite && token ? { token, email: invite.email } : undefined} />

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
