import Link from "next/link";
import { ClipboardCheck, FileText, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { siteConfig } from "@/lib/site";

const features = [
  {
    icon: FileText,
    title: "Broker-ready templates",
    body: "Discovery call, fact find, lender rationale, conditions and settlement notes in one click.",
  },
  {
    icon: ShieldCheck,
    title: "Best Interests audit trail",
    body: "Timestamped file notes, version history and locked, finalised records with amendments.",
  },
  {
    icon: Sparkles,
    title: "AI that drafts, you approve",
    body: "Summaries, action items and key loan figures extracted for you to review before applying.",
  },
  {
    icon: ClipboardCheck,
    title: "Pipeline at a glance",
    body: "Filter notes by client, loan stage and follow-up date so nothing slips through.",
  },
] as const;

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="container-page">
      <section className="py-12 md:py-20">
        <p className="text-primary text-sm font-medium">For Australian mortgage brokers</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-5xl">
          File notes that keep up with every client conversation.
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xl text-base md:text-lg">
          {siteConfig.description}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {user ? (
            <>
              <Button asChild size="lg" className="h-11">
                <Link href="/dashboard">Open my dashboard</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11">
                <Link href="/notes/new">Start a new note</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="lg" className="h-11">
                <Link href="/register">Create free account</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11">
                <Link href="/login">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="features-heading" className="pb-12">
        <h2 id="features-heading" className="sr-only">
          Features
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-card rounded-xl border p-5">
              <Icon className="text-primary size-5" aria-hidden />
              <h3 className="mt-3 font-medium">{title}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
