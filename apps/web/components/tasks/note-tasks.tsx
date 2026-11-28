"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, ListTodo, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import type { NoteEditorApi } from "@/components/editor/note-editor";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { batchTasksAction } from "@/lib/api/task-actions";
import { cn } from "@/lib/utils";
import type { TaskDto, UserRefDto } from "@broker-notes/shared/dto";
import { openChecklistItems } from "@broker-notes/shared/tasks/from-doc";
import { isOpenTask } from "@broker-notes/shared/tasks/taxonomy";

/**
 * The note's follow-up tasks in a side (desktop) / bottom (phone) sheet. Tasks can be added one
 * at a time, or created in one go from the note's unticked checklist items.
 */
export function NoteTasks({
  noteId,
  tasks,
  members,
  currentUserId,
  editorApi,
}: {
  noteId: string;
  tasks: TaskDto[];
  members: UserRefDto[];
  currentUserId: string;
  editorApi: NoteEditorApi | null;
}) {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [pending, startTransition] = useTransition();
  const openCount = tasks.filter((t) => isOpenTask(t.status)).length;

  const fromChecklist = () => {
    if (!editorApi) return;
    const existing = new Set(tasks.map((t) => t.title.toLowerCase()));
    const titles = openChecklistItems(editorApi.getDoc()).filter(
      (t) => !existing.has(t.toLowerCase()),
    );
    if (titles.length === 0) {
      toast.info("No new unticked checklist items to turn into tasks.");
      return;
    }
    startTransition(async () => {
      const res = await batchTasksAction({ noteId, titles, assigneeId: currentUserId });
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        `Created ${res.created} task${res.created === 1 ? "" : "s"} from the checklist`,
      );
      router.refresh();
    });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-10"
          aria-label={`Tasks (${openCount} open)`}
        >
          <ListTodo className="size-4" aria-hidden />
          <span className="hidden sm:inline">Tasks</span>
          {openCount ? (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs tabular-nums">
              {openCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(
          "gap-0",
          isDesktop ? "w-full sm:max-w-md" : "pb-safe max-h-[90dvh] rounded-t-2xl",
        )}
      >
        <SheetHeader>
          <SheetTitle>Follow-up tasks</SheetTitle>
          <SheetDescription>
            Things to chase from this note. Tasks also appear on the client, the case and the Tasks
            page.
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-w-0 grid-cols-1 gap-4 overflow-y-auto px-4 pb-8">
          <div className="flex flex-wrap gap-2">
            <TaskFormDialog
              members={members}
              defaultAssigneeId={currentUserId}
              links={{ noteId, label: "this note" }}
              trigger={
                <Button className="h-10">
                  <Plus className="size-4" aria-hidden /> Add task
                </Button>
              }
            />
            <Button
              variant="outline"
              className="h-10"
              onClick={fromChecklist}
              disabled={pending || !editorApi}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ListChecks className="size-4" aria-hidden />
              )}
              From checklist
            </Button>
          </div>
          <TaskList
            tasks={tasks}
            members={members}
            hide={{ note: true, client: true, case: true }}
            empty="No tasks yet. Add one, or turn the note's unticked checklist into tasks."
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
