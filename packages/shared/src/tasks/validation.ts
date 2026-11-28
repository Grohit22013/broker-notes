import { z } from "zod";

import { parseIsoDate } from "../dates";

import {
  TASK_BATCH_MAX,
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  TASK_TITLE_MAX,
} from "./taxonomy";

export const taskIdSchema = z.cuid({ error: "Invalid task" });

const title = z
  .string({ error: "Give the task a title" })
  .trim()
  .min(1, "Give the task a title")
  .max(TASK_TITLE_MAX, `Titles must be ${TASK_TITLE_MAX} characters or fewer`);

/** Calendar day in the brokerage's time zone ("YYYY-MM-DD"), or null to clear. */
const dueDate = z
  .string()
  .refine((v) => parseIsoDate(v) !== null, { error: "Enter a valid date" })
  .nullable()
  .optional();

/** cuid, or "" / null for "none" (form selects send ""). */
const optionalRef = (label: string) =>
  z
    .union([z.cuid({ error: `Invalid ${label}` }), z.literal("")])
    .transform((v) => v || null)
    .nullable()
    .optional();

export const createTaskSchema = z.object({
  title,
  description: z
    .string()
    .trim()
    .max(TASK_DESCRIPTION_MAX, `Descriptions must be ${TASK_DESCRIPTION_MAX} characters or fewer`)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  dueDate,
  priority: z.enum(TASK_PRIORITY_VALUES).default("MEDIUM"),
  assigneeId: optionalRef("assignee"),
  noteId: optionalRef("note"),
  clientId: optionalRef("client"),
  caseId: optionalRef("case"),
});

/** Partial update; links (note/client/case) are set at creation and don't move. */
export const updateTaskSchema = createTaskSchema
  .omit({ noteId: true, clientId: true, caseId: true })
  .partial()
  .extend({
    priority: z.enum(TASK_PRIORITY_VALUES).optional(),
    status: z.enum(TASK_STATUS_VALUES).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: "Nothing to change" });

/** Several tasks from one note at once (its checklist or AI action items). */
export const batchTasksSchema = z.object({
  noteId: z.cuid({ error: "Invalid note" }),
  titles: z
    .array(title)
    .min(1, "Choose at least one item")
    .max(TASK_BATCH_MAX, `At most ${TASK_BATCH_MAX} tasks at once`),
  dueDate,
  priority: z.enum(TASK_PRIORITY_VALUES).default("MEDIUM"),
  assigneeId: optionalRef("assignee"),
});

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const cuidParam = z.preprocess(first, z.cuid().optional().catch(undefined));

/** Lenient list filters (from the URL). */
export const taskFiltersSchema = z.object({
  /** open (to do + in progress, default), done (completed + cancelled) or all. */
  status: z.preprocess(first, z.enum(["open", "done", "all"]).catch("open")).default("open"),
  /** "me", "unassigned", "any" (default), or a member id. */
  assignee: z.preprocess(first, z.string().max(40).optional().catch(undefined)),
  due: z.preprocess(first, z.enum(["overdue", "today", "week"]).optional().catch(undefined)),
  note: cuidParam,
  client: cuidParam,
  case: cuidParam,
  q: z.preprocess(first, z.string().trim().max(100).catch("")).default(""),
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type CreateTaskData = z.output<typeof createTaskSchema>;
export type UpdateTaskData = z.output<typeof updateTaskSchema>;
export type BatchTasksData = z.output<typeof batchTasksSchema>;
export type TaskFilters = z.output<typeof taskFiltersSchema>;
