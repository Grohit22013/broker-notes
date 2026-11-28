import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { safeRedirect } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; ended?: string }>;
}) {
  const { callbackUrl, ended } = await searchParams;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">Sign in to your client file notes.</p>
      </div>

      {ended ? (
        <p role="status" className="bg-muted text-muted-foreground rounded-md p-3 text-sm">
          Your session has ended. Please sign in again. If your account was deactivated, contact
          your brokerage admin.
        </p>
      ) : null}

      <LoginForm callbackUrl={callbackUrl ? safeRedirect(callbackUrl) : undefined} />

      <p className="text-muted-foreground text-center text-sm">
        New to BrokerNotes?{" "}
        <Link
          href="/register"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
