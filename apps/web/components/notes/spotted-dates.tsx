"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarDays, Check, ListTodo } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createTaskAction } from "@/lib/api/task-actions";
import { parseIsoDate, zonedMidnight } from "@broker-notes/shared/dates";
import type { Analysis } from "@broker-notes/shared/dto";

type SpottedDate = Analysis["dates"][number];

const KIND_LABEL: Record<SpottedDate["kind"], string> = {
  meeting: "Meeting",
  follow_up: "Follow-up",
  deadline: "Deadline",
};

function formatDay(d: SpottedDate) {
  const ymd = parseIsoDate(d.date);
  if (!ymd) return d.date;
  const day = new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Australia/Sydney",
  }).format(zonedMidnight(ymd));
  return d.time ? `${day}, ${d.time}` : day;
}

/**
 * Dates the AI found in the note, each with a one-click action. Nothing changes until the broker
 * clicks: meetings set the note's meeting time, follow-ups its follow-up date, deadlines a task.
 */
export function SpottedDates({
  noteId,
  dates,
  canEditNote,
  onSetMeeting,
  onSetFollowUp,
}: {
  noteId: string;
  dates: SpottedDate[];
  /** False for finalised or view-only notes: the note itself can't change (tasks still can). */
  canEditNote: boolean;
  onSetMeeting: (localDateTime: string) => void;
  onSetFollowUp: (date: string) => void;
}) {
  const router = useRouter();
  const [done, setDone] = useState<Record<number, string>>({});
  const mark = (i: number, label: string) => setDone((d) => ({ ...d, [i]: label }));

  if (!dates.length) {
    return <p className="text-muted-foreground text-sm">No dates to act on were found.</p>;
  }

  return (
    <ul className="grid gap-2">
      {dates.map((d, i) => (
        <li key={`${d.kind}-${d.date}-${i}`} className="rounded-md border p-2.5 text-sm">
          <p className="font-medium">{d.label}</p>
          <p className="text-muted-foreground text-xs">
            {KIND_LABEL[d.kind]} · {formatDay(d)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {done[i] ? (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <Check className="size-3.5" aria-hidden /> {done[i]}
              </span>
            ) : d.kind === "meeting" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!canEditNote}
                onClick={() => {
                  onSetMeeting(`${d.date}T${d.time ?? "09:00"}`);
                  mark(i, "Set as the meeting time");
                }}
              >
                <CalendarDays className="size-3.5" aria-hidden /> Set as meeting time
              </Button>
            ) : d.kind === "follow_up" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!canEditNote}
                onClick={() => {
                  onSetFollowUp(d.date);
                  mark(i, "Set as the follow-up date");
                }}
              >
                <CalendarClock className="size-3.5" aria-hidden /> Set as follow-up
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const res = await createTaskAction({
                    title: d.label,
                    dueDate: d.date,
                    noteId,
                  });
                  if (!res.ok) return void toast.error(res.error);
                  mark(i, "Task created");
                  router.refresh();
                }}
              >
                <ListTodo className="size-3.5" aria-hidden /> Create task
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
