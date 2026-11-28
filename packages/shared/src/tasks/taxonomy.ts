/**
 * Follow-up tasks: statuses, priorities and helpers. Zod-free, so client components can use it.
 * (Research doc §6.7: pending / in progress / completed / cancelled, with a priority.)
 */
export const TASK_STATUSES = [
  { value: "PENDING", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export type TaskStatusValue = (typeof TASK_STATUSES)[number]["value"];
export const TASK_STATUS_VALUES = TASK_STATUSES.map((s) => s.value) as [
  TaskStatusValue,
  ...TaskStatusValue[],
];
export const OPEN_TASK_STATUSES: TaskStatusValue[] = ["PENDING", "IN_PROGRESS"];

export function isOpenTask(status: TaskStatusValue): boolean {
  return OPEN_TASK_STATUSES.includes(status);
}

export function taskStatusLabel(value: TaskStatusValue): string {
  return TASK_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export const TASK_PRIORITIES = [
  { value: "LOW", label: "Low", rank: 0 },
  { value: "MEDIUM", label: "Medium", rank: 1 },
  { value: "HIGH", label: "High", rank: 2 },
] as const;

export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number]["value"];
export const TASK_PRIORITY_VALUES = TASK_PRIORITIES.map((p) => p.value) as [
  TaskPriorityValue,
  ...TaskPriorityValue[],
];

export function taskPriorityLabel(value: TaskPriorityValue): string {
  return TASK_PRIORITIES.find((p) => p.value === value)?.label ?? value;
}

export const TASK_TITLE_MAX = 200;
export const TASK_DESCRIPTION_MAX = 2000;
/** At most this many tasks can be created from one note in one go. */
export const TASK_BATCH_MAX = 20;
