import { CalendarClock, LockKeyhole, Pin, UserRound } from "lucide-react";

import { followUpState, type FollowUpState } from "@broker-notes/shared/dates";
import { formatShortDate } from "@/lib/format";
import {
  loanStage,
  noteTypeLabel,
  type LoanStageValue,
  type NoteTypeValue,
  type StageTone,
} from "@broker-notes/shared/notes/taxonomy";
import { cn } from "@/lib/utils";

const base =
  "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap";

const TONES: Record<StageTone, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

export function StageBadge({ stage, className }: { stage: LoanStageValue; className?: string }) {
  const s = loanStage(stage);
  return (
    <span className={cn(base, TONES[s.tone], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {s.label}
    </span>
  );
}

export function TypeBadge({ type, className }: { type: NoteTypeValue; className?: string }) {
  return (
    <span className={cn(base, "border bg-transparent", className)}>{noteTypeLabel(type)}</span>
  );
}

export function TagBadge({ tag, className }: { tag: string; className?: string }) {
  return <span className={cn(base, "bg-muted text-muted-foreground", className)}>#{tag}</span>;
}

const FOLLOW_UP_STYLES: Record<FollowUpState, string> = {
  overdue: "bg-destructive/10 text-destructive",
  today: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  upcoming: "bg-muted text-muted-foreground",
};

export function FollowUpBadge({
  date,
  now,
  className,
  verb = "Follow up",
}: {
  date: Date;
  now?: Date;
  className?: string;
  /** "Follow up" for notes, "Due" for tasks. */
  verb?: string;
}) {
  const state = followUpState(date, now);
  const label =
    state === "overdue"
      ? `Overdue · ${formatShortDate(date)}`
      : state === "today"
        ? `${verb} today`
        : `${verb} ${formatShortDate(date)}`;
  return (
    <span className={cn(base, FOLLOW_UP_STYLES[state], className)}>
      <CalendarClock className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

export function PinnedMark({ className }: { className?: string }) {
  return (
    <Pin
      className={cn("text-primary size-4 shrink-0 fill-current", className)}
      aria-label="Pinned"
      role="img"
    />
  );
}

export function ClientBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn(base, "bg-primary/10 text-primary max-w-56", className)}>
      <UserRound className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Neutral badge for key figures (loan amount, LVR, lender). */
export function FigureBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(base, "bg-muted text-foreground tabular-nums", className)}>{children}</span>
  );
}

export function FinalisedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        base,
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        className,
      )}
    >
      <LockKeyhole className="size-3.5" aria-hidden />
      Finalised
    </span>
  );
}
