import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  parseIsoDate,
  startOfNextZonedDay,
  startOfZonedDay,
  toIsoDate,
  zonedMidnight,
} from "@broker-notes/shared/dates";
import type { TaskBatchResultDto, TaskDto } from "@broker-notes/shared/dto";
import { displayTitle } from "@broker-notes/shared/notes/content";
import { canChangeTask } from "@broker-notes/shared/orgs/roles";
import { OPEN_TASK_STATUSES, taskStatusLabel } from "@broker-notes/shared/tasks/taxonomy";
import type {
  BatchTasksData,
  CreateTaskData,
  TaskFilters,
  UpdateTaskData,
} from "@broker-notes/shared/tasks/validation";

import { AuditService } from "../audit/audit.service";
import type { SessionUser } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 86_400_000;
const FORBIDDEN = "Only the task's creator, its assignee or a brokerage admin can change it.";

export const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  createdById: true,
  assigneeId: true,
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  note: { select: { id: true, title: true, deletedAt: true } },
  client: { select: { id: true, name: true } },
  case: { select: { id: true, reference: true } },
} satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

export function toTaskDto(r: TaskRow, actor: SessionUser): TaskDto {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueAt ? toIsoDate(r.dueAt) : null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    assignee: r.assignee,
    createdBy: r.createdBy,
    // A deleted note is hidden everywhere — tasks don't leak it.
    note: r.note && !r.note.deletedAt ? { id: r.note.id, title: displayTitle(r.note.title) } : null,
    client: r.client,
    case: r.case,
    canChange: canChangeTask(actor, r),
  };
}

const dueAtOf = (dueDate: string | null | undefined) => {
  if (dueDate === undefined) return undefined;
  const ymd = dueDate === null ? null : parseIsoDate(dueDate);
  return ymd ? zonedMidnight(ymd) : null;
};

type Links = { noteId: string | null; clientId: string | null; caseId: string | null };

/** Follow-up tasks, scoped to the member's brokerage. */
@Injectable()
export class TasksService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: SessionUser, f: TaskFilters, now = new Date()): Promise<TaskDto[]> {
    const where: Prisma.TaskWhereInput = { organisationId: actor.organisationId };
    const open = f.status === "open";
    if (open) where.status = { in: OPEN_TASK_STATUSES };
    else if (f.status === "done") where.status = { in: ["COMPLETED", "CANCELLED"] };

    if (f.assignee === "me") where.assigneeId = actor.id;
    else if (f.assignee === "unassigned") where.assigneeId = null;
    else if (f.assignee && f.assignee !== "any") where.assigneeId = f.assignee;

    const today = startOfZonedDay(now);
    const tomorrow = startOfNextZonedDay(now);
    if (f.due === "overdue") where.dueAt = { lt: today };
    else if (f.due === "today") where.dueAt = { gte: today, lt: tomorrow };
    else if (f.due === "week") where.dueAt = { lt: new Date(tomorrow.getTime() + 7 * DAY_MS) };

    if (f.note) where.noteId = f.note;
    if (f.client) where.clientId = f.client;
    if (f.case) where.caseId = f.case;
    if (f.q) where.title = { contains: f.q, mode: "insensitive" };

    const rows = await this.db.task.findMany({
      where,
      orderBy: open
        ? [{ dueAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { createdAt: "asc" }]
        : [{ updatedAt: "desc" }],
      take: 300,
      select: taskSelect,
    });
    return rows.map((r) => toTaskDto(r, actor));
  }

  async get(actor: SessionUser, id: string): Promise<TaskDto> {
    const row = await this.db.task.findFirst({
      where: { id, organisationId: actor.organisationId },
      select: taskSelect,
    });
    if (!row) throw new NotFoundException("Task not found");
    return toTaskDto(row, actor);
  }

  async create(actor: SessionUser, data: CreateTaskData): Promise<TaskDto> {
    const links = await this.resolveLinks(actor, data);
    await this.assertAssignee(actor, data.assigneeId);
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          organisationId: actor.organisationId,
          title: data.title,
          description: data.description ?? null,
          priority: data.priority,
          dueAt: dueAtOf(data.dueDate) ?? null,
          assigneeId: data.assigneeId ?? null,
          createdById: actor.id,
          ...links,
        },
        select: taskSelect,
      });
      await this.audit.record(
        actor,
        {
          action: "task.created",
          summary: `Created task “${created.title}”${created.assignee ? ` for ${created.assignee.name}` : ""}`,
          entityType: "task",
          entityId: created.id,
        },
        tx,
      );
      return created;
    });
    return toTaskDto(row, actor);
  }

  /** Several tasks from one note (its unticked checklist or AI action items), in one go. */
  async batch(actor: SessionUser, data: BatchTasksData): Promise<TaskBatchResultDto> {
    const links = await this.resolveLinks(actor, { noteId: data.noteId });
    await this.assertAssignee(actor, data.assigneeId);
    const note = await this.db.note.findUniqueOrThrow({
      where: { id: data.noteId },
      select: { title: true },
    });
    const rows = await this.db.$transaction(async (tx) => {
      const created: TaskRow[] = [];
      for (const title of data.titles) {
        created.push(
          await tx.task.create({
            data: {
              organisationId: actor.organisationId,
              title,
              priority: data.priority,
              dueAt: dueAtOf(data.dueDate) ?? null,
              assigneeId: data.assigneeId ?? null,
              createdById: actor.id,
              ...links,
            },
            select: taskSelect,
          }),
        );
      }
      await this.audit.record(
        actor,
        {
          action: "task.created",
          summary: `Created ${created.length} task${created.length === 1 ? "" : "s"} from “${displayTitle(note.title)}”`,
          entityType: "note",
          entityId: data.noteId,
          metadata: { count: created.length },
        },
        tx,
      );
      return created;
    });
    return { created: rows.length, tasks: rows.map((r) => toTaskDto(r, actor)) };
  }

  async update(actor: SessionUser, id: string, data: UpdateTaskData): Promise<TaskDto> {
    const current = await this.db.task.findFirst({
      where: { id, organisationId: actor.organisationId },
      select: { title: true, status: true, createdById: true, assigneeId: true },
    });
    if (!current) throw new NotFoundException("Task not found");
    if (!canChangeTask(actor, current)) throw new ForbiddenException(FORBIDDEN);
    await this.assertAssignee(actor, data.assigneeId);

    const { status, dueDate, ...rest } = data;
    const statusChanged = status !== undefined && status !== current.status;
    const otherFields = Object.keys(data).filter(
      (k) => k !== "status" && data[k as keyof UpdateTaskData] !== undefined,
    );

    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          ...rest,
          ...(dueDate !== undefined ? { dueAt: dueAtOf(dueDate) } : {}),
          ...(statusChanged
            ? status === "COMPLETED"
              ? { status, completedAt: new Date(), completedById: actor.id }
              : { status, completedAt: null, completedById: null }
            : {}),
        },
        select: taskSelect,
      });
      if (statusChanged) {
        const verb =
          status === "COMPLETED"
            ? "Completed"
            : status === "CANCELLED"
              ? "Cancelled"
              : current.status === "COMPLETED" || current.status === "CANCELLED"
                ? "Reopened"
                : `Marked ${taskStatusLabel(status!).toLowerCase()}:`;
        await this.audit.record(
          actor,
          {
            action: "task.status_changed",
            summary: `${verb} “${updated.title}”`,
            entityType: "task",
            entityId: id,
            metadata: { from: current.status, to: status! },
          },
          tx,
        );
      }
      if (otherFields.length) {
        await this.audit.record(
          actor,
          {
            action: "task.updated",
            summary:
              otherFields.length === 1 && otherFields[0] === "assigneeId"
                ? updated.assignee
                  ? `Assigned “${updated.title}” to ${updated.assignee.name}`
                  : `Unassigned “${updated.title}”`
                : `Updated “${updated.title}” (${otherFields.map((f) => (f === "assigneeId" ? "assignee" : f)).join(", ")})`,
            entityType: "task",
            entityId: id,
            metadata: { fields: otherFields },
          },
          tx,
        );
      }
      return updated;
    });
    return toTaskDto(row, actor);
  }

  /**
   * Validates note/client/case against the brokerage and makes them consistent: a note brings its
   * client and case; a case brings its client.
   */
  private async resolveLinks(
    actor: SessionUser,
    input: { noteId?: string | null; clientId?: string | null; caseId?: string | null },
  ): Promise<Links> {
    const org = actor.organisationId;
    const links: Links = {
      noteId: input.noteId ?? null,
      clientId: input.clientId ?? null,
      caseId: input.caseId ?? null,
    };
    if (links.noteId) {
      const note = await this.db.note.findFirst({
        where: { id: links.noteId, organisationId: org, deletedAt: null },
        select: { clientId: true, caseId: true },
      });
      if (!note) throw new NotFoundException({ message: "Note not found", field: "noteId" });
      links.caseId ??= note.caseId;
      links.clientId ??= note.clientId;
    }
    if (links.caseId) {
      const c = await this.db.mortgageCase.findFirst({
        where: { id: links.caseId, organisationId: org },
        select: { clientId: true },
      });
      if (!c) throw new NotFoundException({ message: "Case not found", field: "caseId" });
      links.clientId = c.clientId;
    }
    if (links.clientId) {
      const ok = await this.db.client.count({ where: { id: links.clientId, organisationId: org } });
      if (!ok) throw new NotFoundException({ message: "Client not found", field: "clientId" });
    }
    return links;
  }

  private async assertAssignee(actor: SessionUser, assigneeId: string | null | undefined) {
    if (!assigneeId) return;
    const ok = await this.db.user.count({
      where: { id: assigneeId, organisationId: actor.organisationId, deactivatedAt: null },
    });
    if (!ok) throw new NotFoundException({ message: "Member not found", field: "assigneeId" });
  }
}
