import type { Metadata } from "next";
import Link from "next/link";
import {
  Briefcase,
  CalendarClock,
  ChevronRight,
  FileText,
  ListTodo,
  Pin,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { CASE_TONES } from "@/components/cases/case-badges";
import { FollowUpBadge } from "@/components/notes/badges";
import { NewNoteButton } from "@/components/notes/new-note-button";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { activeMembers, getCalendar, getDashboard } from "@/lib/api/queries";
import { MiniCalendar } from "@/components/calendar/mini-calendar";
import { gridRange } from "@broker-notes/shared/calendar";
import { toIsoDate, zonedYmd } from "@broker-notes/shared/dates";
import { TaskList } from "@/components/tasks/task-list";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { caseStage } from "@broker-notes/shared/cases/taxonomy";
import { displayTitle } from "@broker-notes/shared/notes/content";
import type { NoteListItemDto } from "@broker-notes/shared/dto";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Australia/Sydney",
    }).format(now),
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const today = toIsoDate(now);
  const { year, month } = zonedYmd(now);
  const range = gridRange(year, month);
  const [d, members, calendar] = await Promise.all([
    getDashboard(),
    activeMembers(),
    getCalendar(range.from, range.to),
  ]);
  const pipelineTotal = d.pipeline.reduce((n, p) => n + p.count, 0);

  const stats: { label: string; value: number; href: string; icon: LucideIcon; hint: string }[] = [
    {
      label: "Follow-ups due",
      value: d.counts.followUpsDue,
      href: "/notes?due=1",
      icon: CalendarClock,
      hint: "today or overdue",
    },
    {
      label: "My tasks",
      value: d.counts.myOpenTasks,
      href: "/tasks",
      icon: ListTodo,
      hint: d.counts.myOverdueTasks ? `${d.counts.myOverdueTasks} overdue` : "none overdue",
    },
    {
      label: "Open cases",
      value: d.counts.openCases,
      href: "/cases",
      icon: Briefcase,
      hint: `${d.counts.myOpenCases} assigned to you`,
    },
    {
      label: "File notes",
      value: d.counts.notes,
      href: "/notes",
      icon: FileText,
      hint: `${d.counts.myNotes} written by you`,
    },
  ];

  return (
    <div className="container-page pb-10">
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={user.organisationName || undefined}
        actions={<NewNoteButton />}
      />

      <form action="/notes" role="search" className="relative mb-6 max-w-xl">
        <Search
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          name="q"
          placeholder="Search notes, clients or case references"
          aria-label="Search notes"
          className="h-11 pl-9 text-base md:text-sm"
        />
      </form>

      <ul className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className="bg-card hover:border-primary/40 flex items-center gap-3 rounded-xl border p-4"
            >
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                <s.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-semibold tabular-nums">{s.value}</span>
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="text-muted-foreground block text-xs">{s.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-2">
          <section aria-labelledby="my-tasks" className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="my-tasks" className="flex items-center gap-2 font-semibold">
                <ListTodo className="text-primary size-4" aria-hidden /> My tasks
              </h2>
              <Button asChild variant="ghost" size="sm" className="text-primary h-8">
                <Link href="/tasks" aria-label="See all: My tasks">
                  See all
                </Link>
              </Button>
            </div>
            <TaskList tasks={d.myTasks} members={members} empty="Nothing assigned to you." />
          </section>
          <Panel
            title="Follow-ups"
            icon={CalendarClock}
            href="/notes?sort=followup"
            empty="No follow-ups in the next week."
          >
            {d.followUps.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                badge={n.followUpAt ? <FollowUpBadge date={new Date(n.followUpAt)} /> : null}
              />
            ))}
          </Panel>
          <Panel
            title="Pinned"
            icon={Pin}
            href="/notes"
            empty="Pin important notes to keep them here."
          >
            {d.pinned.map((n) => (
              <NoteRow key={n.id} note={n} />
            ))}
          </Panel>
          <Panel
            title="Recently edited"
            icon={FileText}
            href="/notes"
            empty="No notes yet — start one above."
          >
            {d.recent.map((n) => (
              <NoteRow key={n.id} note={n} />
            ))}
          </Panel>
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <MiniCalendar initial={{ year, month, data: calendar }} today={today} />
          <section aria-labelledby="pipeline-title" className="bg-card rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="pipeline-title" className="flex items-center gap-2 font-semibold">
                <Briefcase className="text-primary size-4" aria-hidden /> Case pipeline
              </h2>
              <Link href="/cases" className="text-primary text-sm font-medium hover:underline">
                All cases
              </Link>
            </div>
            {pipelineTotal === 0 ? (
              <p className="text-muted-foreground text-sm">No open cases.</p>
            ) : (
              <ol className="grid grid-cols-1 gap-1.5">
                {d.pipeline.map((p) => {
                  const s = caseStage(p.stage);
                  return (
                    <li key={p.stage}>
                      <Link
                        href={`/cases?stage=${p.stage}`}
                        className="hover:bg-accent flex items-center gap-2 rounded-md px-1 py-1 text-sm"
                        aria-label={`${s.label}: ${p.count} ${p.count === 1 ? "case" : "cases"}`}
                      >
                        <span className="w-28 shrink-0 truncate">{s.label}</span>
                        <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                          <span
                            className={cn("block h-full rounded-full", CASE_TONES[s.tone])}
                            style={{ width: `${(p.count / pipelineTotal) * 100}%` }}
                          />
                        </span>
                        <span className="w-6 text-right tabular-nums">{p.count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <Panel
            title="Recent clients"
            icon={UserRound}
            href="/clients"
            empty="Clients you write notes for appear here."
          >
            {d.recentClients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.id}`}
                  className="hover:bg-accent flex items-center justify-between gap-2 rounded-md px-2 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {c.noteCount} {c.noteCount === 1 ? "note" : "notes"} · last{" "}
                      {formatRelative(new Date(c.lastNoteAt))}
                    </span>
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  href,
  empty,
  children,
}: {
  title: string;
  icon: LucideIcon;
  href: string;
  empty: string;
  children: React.ReactNode[];
}) {
  const id = `panel-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="bg-card min-w-0 rounded-xl border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 id={id} className="flex items-center gap-2 font-semibold">
          <Icon className="text-primary size-4" aria-hidden /> {title}
        </h2>
        <Button asChild variant="ghost" size="sm" className="text-primary h-8">
          <Link href={href} aria-label={`See all: ${title}`}>
            See all
          </Link>
        </Button>
      </div>
      {children.length ? (
        <ul className="grid grid-cols-1 gap-0.5">{children}</ul>
      ) : (
        <p className="text-muted-foreground text-sm">{empty}</p>
      )}
    </section>
  );
}

function NoteRow({ note, badge }: { note: NoteListItemDto; badge?: React.ReactNode }) {
  return (
    <li>
      <Link
        href={`/notes/${note.id}`}
        className="hover:bg-accent flex items-center gap-3 rounded-md px-2 py-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{displayTitle(note.title)}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {[note.client?.name, note.case?.reference, note.author.name]
              .filter(Boolean)
              .join(" · ")}
            {" · "}edited {formatRelative(new Date(note.updatedAt))}
          </span>
        </span>
        {badge}
      </Link>
    </li>
  );
}
