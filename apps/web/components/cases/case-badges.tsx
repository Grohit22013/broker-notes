import Link from "next/link";
import { Briefcase } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  caseStage,
  type CaseStageTone,
  type CaseStageValue,
} from "@broker-notes/shared/cases/taxonomy";

const base =
  "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap";

export const CASE_TONES: Record<CaseStageTone, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  zinc: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function CaseStageBadge({
  stage,
  className,
}: {
  stage: CaseStageValue;
  className?: string;
}) {
  const s = caseStage(stage);
  return (
    <span className={cn(base, CASE_TONES[s.tone], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {s.label}
    </span>
  );
}

/** A case reference chip; links to the case unless `asLink` is false (e.g. inside another link). */
export function CaseRefBadge({
  id,
  reference,
  asLink = true,
  className,
}: {
  id: string;
  reference: string;
  asLink?: boolean;
  className?: string;
}) {
  const content = (
    <>
      <Briefcase className="size-3" aria-hidden />
      <span className="font-mono">{reference}</span>
    </>
  );
  const cls = cn(base, "border bg-background", className);
  return asLink ? (
    <Link
      href={`/cases/${id}`}
      className={cn(cls, "hover:bg-accent")}
      aria-label={`Open case ${reference}`}
    >
      {content}
    </Link>
  ) : (
    <span className={cls}>{content}</span>
  );
}
