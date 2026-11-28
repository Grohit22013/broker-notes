"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTaskAction, updateTaskAction } from "@/lib/api/task-actions";
import type { TaskDto, UserRefDto } from "@broker-notes/shared/dto";
import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@broker-notes/shared/tasks/taxonomy";

const NONE = "__none__";

type Props = {
  trigger: React.ReactNode;
  members: UserRefDto[];
  /** Edit this task; otherwise create one. */
  existing?: TaskDto;
  /** For a new task: what it's about (shown, not editable). */
  links?: { noteId?: string; clientId?: string; caseId?: string; label?: string };
  /** For a new task: who it's for by default. */
  defaultAssigneeId?: string;
};

export function TaskFormDialog({ trigger, members, existing, links, defaultAssigneeId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [priority, setPriority] = useState<TaskPriorityValue>(existing?.priority ?? "MEDIUM");
  const [status, setStatus] = useState<TaskStatusValue>(existing?.status ?? "PENDING");
  const [assigneeId, setAssigneeId] = useState(
    existing ? (existing.assignee?.id ?? NONE) : (defaultAssigneeId ?? NONE),
  );
  const readOnly = existing ? !existing.canChange : false;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      dueDate: String(fd.get("dueDate") ?? "") || null,
      priority,
      assigneeId: assigneeId === NONE ? null : assigneeId,
    };
    startTransition(async () => {
      const res = existing
        ? await updateTaskAction(existing.id, {
            ...fields,
            description: fields.description || null,
            ...(status !== existing.status ? { status } : {}),
          })
        : await createTaskAction({ ...fields, ...links });
      if (!res.ok) return setError({ field: res.field, message: res.error });
      setError(null);
      setOpen(false);
      toast.success(existing ? "Task updated" : `Task “${res.task.title}” added`);
      router.refresh();
    });
  };

  const members_ =
    existing?.assignee && !members.some((m) => m.id === existing.assignee!.id)
      ? [...members, existing.assignee]
      : members;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{existing ? "Task" : "New task"}</DialogTitle>
            <DialogDescription>
              {readOnly
                ? `Created by ${existing!.createdBy.name}. Only its creator, its assignee or an admin can change it.`
                : links?.label
                  ? `For ${links.label}.`
                  : "A follow-up to chase: documents, call-backs, lender conditions."}
            </DialogDescription>
          </DialogHeader>
          {error && error.field !== "title" ? (
            <p className="text-destructive text-sm" role="alert">
              {error.message}
            </p>
          ) : null}
          <fieldset disabled={readOnly} className="grid min-w-0 grid-cols-1 gap-4">
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                name="title"
                required
                autoFocus={!existing}
                maxLength={TASK_TITLE_MAX}
                defaultValue={existing?.title}
                placeholder="e.g. Request 3 months of payslips"
                aria-invalid={error?.field === "title" || undefined}
                className="h-11 text-base md:text-sm"
              />
              {error?.field === "title" ? (
                <p className="text-destructive text-sm" role="alert">
                  {error.message}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid min-w-0 grid-cols-1 gap-2">
                <Label htmlFor="task-due">Due date</Label>
                <Input
                  id="task-due"
                  name="dueDate"
                  type="date"
                  defaultValue={existing?.dueDate ?? ""}
                  className="h-11 text-base md:text-sm"
                />
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2">
                <Label htmlFor="task-priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriorityValue)}>
                  <SelectTrigger id="task-priority" className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid min-w-0 grid-cols-1 gap-2">
                <Label htmlFor="task-assignee">Assigned to</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger id="task-assignee" className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    {members_.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {existing ? (
                <div className="grid min-w-0 grid-cols-1 gap-2">
                  <Label htmlFor="task-status">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TaskStatusValue)}>
                    <SelectTrigger id="task-status" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor="task-description">Details (optional)</Label>
              <Textarea
                id="task-description"
                name="description"
                maxLength={TASK_DESCRIPTION_MAX}
                defaultValue={existing?.description ?? ""}
                className="min-h-20 text-base md:text-sm"
              />
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {readOnly ? null : (
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {existing ? "Save" : "Add task"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
