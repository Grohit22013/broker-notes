"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, FileText, Flag, UserRound, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";

import { FollowUpBadge } from "@/components/notes/badges";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { updateTaskAction } from "@/lib/api/task-actions";
import { cn } from "@/lib/utils";
import { parseIsoDate, zonedMidnight } from "@broker-notes/shared/dates";
import type { TaskDto, UserRefDto } from "@broker-notes/shared/dto";
import {
  isOpenTask,
  taskStatusLabel,
  type TaskStatusValue,
} from "@broker-notes/shared/tasks/taxonomy";

type Props = {
  tasks: TaskDto[];
  members: UserRefDto[];
  /** Hide links that the surrounding page already shows. */
  hide?: { note?: boolean; client?: boolean; case?: boolean };
  empty?: string;
};

/** A list of tasks with one-tap completion; clicking a title opens it for editing. */
export function TaskList({ tasks: initial, members, hide = {}, empty = "No tasks." }: Props) {
  const router = useRouter();
  // The server's list is the source of truth; ticks show instantly via optimistic overrides.
  // (Copying props into state with an effect stalled Next's navigation transitions.)
  const [overrides, setOverrides] = useState<Record<string, TaskStatusValue>>({});
  const tasks = initial.map((t) => (overrides[t.id] ? { ...t, status: overrides[t.id]! } : t));
  const clearOverride = (id: string) => setOverrides(({ [id]: _dropped, ...rest }) => rest);

  const toggle = (t: TaskDto) => {
    const status: TaskStatusValue = isOpenTask(t.status) ? "COMPLETED" : "PENDING";
    setOverrides((o) => ({ ...o, [t.id]: status }));
    void (async () => {
      const res = await updateTaskAction(t.id, { status });
      if (!res.ok) {
        clearOverride(t.id);
        toast.error(res.error);
        return;
      }
      toast.success(status === "COMPLETED" ? `Done: ${t.title}` : `Reopened: ${t.title}`);
      router.refresh();
    })();
  };

  if (tasks.length === 0) {
    return <p className="text-muted-foreground bg-card rounded-xl border p-4 text-sm">{empty}</p>;
  }

  return (
    <ul className="bg-card grid grid-cols-1 divide-y rounded-xl border" aria-label="Tasks">
      {tasks.map((t) => {
        const open = isOpenTask(t.status);
        const due = t.dueDate ? parseIsoDate(t.dueDate) : null;
        return (
          <li key={t.id} className="flex min-w-0 items-start gap-3 p-3">
            <input
              type="checkbox"
              checked={t.status === "COMPLETED"}
              disabled={!t.canChange || t.status === "CANCELLED"}
              onChange={() => toggle(t)}
              aria-label={open ? `Mark “${t.title}” as done` : `Reopen “${t.title}”`}
              className="accent-primary mt-1 size-5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <TaskFormDialog
                  existing={t}
                  members={members}
                  trigger={
                    <button
                      type="button"
                      className={cn(
                        "min-w-0 text-left text-sm font-medium [overflow-wrap:anywhere] underline-offset-4 hover:underline",
                        !open && "text-muted-foreground line-through",
                      )}
                    >
                      {t.title}
                    </button>
                  }
                />
                {open && due ? <FollowUpBadge date={zonedMidnight(due)} verb="Due" /> : null}
                {open && t.priority === "HIGH" ? (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-rose-100 px-2 text-xs font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    <Flag className="size-3" aria-hidden /> High
                  </span>
                ) : null}
                {t.status === "IN_PROGRESS" || t.status === "CANCELLED" ? (
                  <span className="text-muted-foreground text-xs">{taskStatusLabel(t.status)}</span>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {t.client && !hide.client ? (
                  <Link
                    href={`/clients/${t.client.id}`}
                    className="flex items-center gap-1 hover:underline"
                  >
                    <UserRound className="size-3.5" aria-hidden /> {t.client.name}
                  </Link>
                ) : null}
                {t.case && !hide.case ? (
                  <Link
                    href={`/cases/${t.case.id}`}
                    className="flex items-center gap-1 font-mono hover:underline"
                  >
                    <Briefcase className="size-3.5" aria-hidden /> {t.case.reference}
                  </Link>
                ) : null}
                {t.note && !hide.note ? (
                  <Link
                    href={`/notes/${t.note.id}`}
                    className="flex min-w-0 items-center gap-1 hover:underline"
                  >
                    <FileText className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{t.note.title}</span>
                  </Link>
                ) : null}
                <span className="flex items-center gap-1">
                  <UserRoundCheck className="size-3.5" aria-hidden />
                  {t.assignee?.name ?? "Unassigned"}
                </span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
