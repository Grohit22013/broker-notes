"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { gridRange, monthGrid, shiftMonth } from "@broker-notes/shared/calendar";
import type { CalendarDto, CalendarItemDto, CalendarItemKind } from "@broker-notes/shared/dto";

const KIND: Record<CalendarItemKind, { label: string; dot: string; chip: string }> = {
  meeting: {
    label: "Meeting",
    dot: "bg-violet-500",
    chip: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  follow_up: {
    label: "Follow-up",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
  task: {
    label: "Task",
    dot: "bg-sky-500",
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

function summarise(items: CalendarItemDto[]) {
  const n = (k: CalendarItemKind) => items.filter((i) => i.kind === k).length;
  return (
    [
      [n("meeting"), "meeting"],
      [n("follow_up"), "follow-up"],
      [n("task"), "task"],
    ] as const
  )
    .filter(([c]) => c > 0)
    .map(([c, w]) => `${c} ${w}${c === 1 ? "" : "s"}`)
    .join(", ");
}

/**
 * Month calendar of meetings, follow-ups and open tasks. Days with items show coloured dots;
 * choosing a day lists them, each linking to its note (or the Tasks page).
 */
export function MiniCalendar({
  initial,
  today,
}: {
  initial: { year: number; month: number; data: CalendarDto };
  /** "YYYY-MM-DD" in Sydney. */
  today: string;
}) {
  const [ym, setYm] = useState({ year: initial.year, month: initial.month });
  const [data, setData] = useState(initial.data);
  const [selected, setSelected] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byDay = new Map<string, CalendarItemDto[]>();
  for (const item of data.items) byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);
  const weeks = monthGrid(ym.year, ym.month);
  const dayItems = byDay.get(selected) ?? [];

  const go = (by: number) => {
    const next = shiftMonth(ym.year, ym.month, by);
    const { from, to } = gridRange(next.year, next.month);
    startTransition(async () => {
      const res = await api<CalendarDto>("GET", `/calendar?from=${from}&to=${to}`);
      if (!res.ok) return setError(res.error);
      setError(null);
      setYm(next);
      setData(res.data);
      const thisMonth = `${next.year}-${String(next.month).padStart(2, "0")}`;
      setSelected(today.startsWith(thisMonth) ? today : `${thisMonth}-01`);
    });
  };

  return (
    <section aria-labelledby="calendar-title" className="bg-card min-w-0 rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="calendar-title" className="flex items-center gap-2 font-semibold">
          <CalendarDays className="text-primary size-4" aria-hidden /> Calendar
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-label="Loading" /> : null}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => go(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium" aria-live="polite">
            {monthLabel(ym.year, ym.month)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => go(1)}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-destructive mb-2 text-sm">
          {error}
        </p>
      ) : null}

      <div
        role="grid"
        aria-label={monthLabel(ym.year, ym.month)}
        className="grid grid-cols-7 gap-0.5 text-center"
      >
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            role="columnheader"
            className="text-muted-foreground pb-1 text-[0.7rem] font-medium"
          >
            {d}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const items = byDay.get(d.date) ?? [];
          const kinds = [...new Set(items.map((i) => i.kind))];
          const isSelected = d.date === selected;
          return (
            <button
              key={d.date}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-current={d.date === today ? "date" : undefined}
              aria-label={`${dayLabel(d.date)}${items.length ? `: ${summarise(items)}` : ""}`}
              onClick={() => setSelected(d.date)}
              className={cn(
                "flex h-10 flex-col items-center justify-center gap-0.5 rounded-md text-sm transition-colors",
                d.inMonth ? "" : "text-muted-foreground/50",
                isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                d.date === today && !isSelected && "ring-primary/40 font-semibold ring-1",
              )}
            >
              <span className="leading-none tabular-nums">{d.day}</span>
              <span className="flex h-1.5 gap-0.5" aria-hidden>
                {kinds.map((k) => (
                  <span
                    key={k}
                    className={cn(
                      "size-1.5 rounded-full",
                      isSelected ? "bg-primary-foreground" : KIND[k].dot,
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-hidden>
        {(Object.keys(KIND) as CalendarItemKind[]).map((k) => (
          <span key={k} className="text-muted-foreground flex items-center gap-1">
            <span className={cn("size-2 rounded-full", KIND[k].dot)} /> {KIND[k].label}
          </span>
        ))}
      </div>

      <div className="mt-3 border-t pt-3">
        <h3 className="mb-2 text-sm font-medium">{dayLabel(selected)}</h3>
        {dayItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing scheduled.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1" aria-label={`Scheduled on ${dayLabel(selected)}`}>
            {dayItems.map((item, i) => (
              <li key={`${item.kind}-${item.href}-${i}`}>
                <Link
                  href={item.href}
                  className="hover:bg-accent flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5"
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full px-1.5 text-[0.7rem] font-medium",
                      KIND[item.kind].chip,
                    )}
                  >
                    {item.time ?? KIND[item.kind].label}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[
                        item.time ? KIND[item.kind].label : null,
                        item.clientName,
                        item.overdue ? "Overdue" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || " "}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
