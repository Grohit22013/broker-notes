/** Browser-side calls for follow-up tasks. The API enforces who may change what. */
import type { TaskBatchResultDto, TaskDto } from "@broker-notes/shared/dto";
import type { CreateTaskInput } from "@broker-notes/shared/tasks/validation";
import type { TaskPriorityValue, TaskStatusValue } from "@broker-notes/shared/tasks/taxonomy";

import { api } from "./client";

export type TaskResult = { ok: true; task: TaskDto } | { ok: false; error: string; field?: string };

export async function createTaskAction(input: CreateTaskInput): Promise<TaskResult> {
  const res = await api<TaskDto>("POST", "/tasks", input);
  return res.ok
    ? { ok: true, task: res.data }
    : { ok: false, error: res.error, ...(res.field ? { field: res.field } : {}) };
}

export type TaskUpdate = {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriorityValue;
  assigneeId?: string | null;
  status?: TaskStatusValue;
};

export async function updateTaskAction(id: string, change: TaskUpdate): Promise<TaskResult> {
  const res = await api<TaskDto>("PATCH", `/tasks/${encodeURIComponent(id)}`, change);
  return res.ok
    ? { ok: true, task: res.data }
    : { ok: false, error: res.error, ...(res.field ? { field: res.field } : {}) };
}

/** Several tasks from one note (its unticked checklist, or AI action items). */
export async function batchTasksAction(input: {
  noteId: string;
  titles: string[];
  assigneeId?: string | null;
}): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const res = await api<TaskBatchResultDto>("POST", "/tasks/batch", input);
  return res.ok ? { ok: true, created: res.data.created } : { ok: false, error: res.error };
}

export async function loadTasks(params: Record<string, string>): Promise<TaskDto[] | null> {
  const res = await api<TaskDto[]>("GET", `/tasks?${new URLSearchParams(params).toString()}`);
  return res.ok ? res.data : null;
}
