import type { Metadata } from "next";
import { Plus, Search } from "lucide-react";

import { FilterChip } from "@/components/shared/filter-chip";
import { PageHeader } from "@/components/shared/page-header";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { activeMembers, listTasks } from "@/lib/api/queries";
import { taskFiltersSchema } from "@broker-notes/shared/tasks/validation";

export const metadata: Metadata = { title: "Tasks" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Views: whose tasks, and open or done. "Mine" is the default. */
const VIEWS = [
  { key: "mine", label: "Assigned to me", assignee: "me", status: "open" },
  { key: "all", label: "All open", assignee: "any", status: "open" },
  { key: "unassigned", label: "Unassigned", assignee: "unassigned", status: "open" },
  { key: "done", label: "Done & cancelled", assignee: "any", status: "done" },
] as const;

const DUE = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "week", label: "Next 7 days" },
] as const;

export default async function TasksPage({ searchParams }: Props) {
  const user = await requireUser();
  const raw = await searchParams;
  const f = taskFiltersSchema.parse(raw);
  const viewKey = typeof raw.view === "string" ? raw.view : "mine";
  const view = VIEWS.find((v) => v.key === viewKey) ?? VIEWS[0];

  const [tasks, members] = await Promise.all([
    listTasks({
      assignee: view.assignee,
      status: view.status,
      due: view.status === "open" ? f.due : undefined,
      q: f.q || undefined,
    }),
    activeMembers(),
  ]);

  const href = (patch: { view?: string; due?: string | undefined }) => {
    const p = new URLSearchParams();
    const next = { view: view.key, due: f.due, q: f.q || undefined, ...patch };
    if (next.view && next.view !== "mine") p.set("view", next.view);
    if (next.due) p.set("due", next.due);
    if (next.q) p.set("q", next.q);
    const qs = p.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  };

  const chip = (label: string, to: string, active: boolean) => (
    <FilterChip key={label} href={to} active={active}>
      {label}
    </FilterChip>
  );

  return (
    <div className="container-page pb-10">
      <PageHeader
        title="Tasks"
        description="Follow-ups to chase: documents, call-backs and lender conditions."
        actions={
          <TaskFormDialog
            members={members}
            defaultAssigneeId={user.id}
            trigger={
              <Button className="h-10">
                <Plus className="size-4" aria-hidden /> New task
              </Button>
            }
          />
        }
      />

      <form action="/tasks" role="search" className="relative mb-3 max-w-md">
        {view.key !== "mine" ? <input type="hidden" name="view" value={view.key} /> : null}
        <Search
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          name="q"
          defaultValue={f.q}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="h-11 pl-9 text-base md:text-sm"
        />
      </form>

      <nav aria-label="Filter tasks" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {VIEWS.map((v) => chip(v.label, href({ view: v.key }), v.key === view.key))}
        {view.status === "open" ? (
          <>
            <span className="bg-border mx-1 w-px shrink-0" aria-hidden />
            {DUE.map((d) =>
              chip(d.label, href({ due: f.due === d.key ? undefined : d.key }), f.due === d.key),
            )}
          </>
        ) : null}
      </nav>

      <p className="text-muted-foreground mb-3 text-sm" aria-live="polite">
        {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
      </p>
      <TaskList
        tasks={tasks}
        members={members}
        empty={
          view.key === "mine" && !f.due && !f.q
            ? "Nothing assigned to you. Nice work."
            : "No tasks match."
        }
      />
    </div>
  );
}
