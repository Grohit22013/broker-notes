import { Controller, Get, Injectable } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Prisma } from "@prisma/client";
import { CASE_STAGES, OPEN_CASE_STAGES } from "@broker-notes/shared/cases/taxonomy";
import { OPEN_TASK_STATUSES } from "@broker-notes/shared/tasks/taxonomy";
import { startOfNextZonedDay, startOfZonedDay } from "@broker-notes/shared/dates";
import type { DashboardDto } from "@broker-notes/shared/dto";

import { CurrentUser, type SessionUser } from "../auth/auth.guard";
import { SESSION_COOKIE } from "../config";
import { listSelect, toListItem } from "../notes/notes.service";
import { PrismaService } from "../prisma/prisma.service";
import { taskSelect, toTaskDto } from "../tasks/tasks.service";

const DAY_MS = 86_400_000;

/** One round of parallel queries that gives the signed-in member their landing page. */
@Injectable()
export class DashboardService {
  constructor(private readonly db: PrismaService) {}

  async get(actor: SessionUser, now = new Date()): Promise<DashboardDto> {
    const org = actor.organisationId;
    const notes: Prisma.NoteWhereInput = { organisationId: org, deletedAt: null };
    const dueBy = startOfNextZonedDay(now);
    const open = { organisationId: org, stage: { in: OPEN_CASE_STAGES } };
    const myOpenTasks: Prisma.TaskWhereInput = {
      organisationId: org,
      assigneeId: actor.id,
      status: { in: OPEN_TASK_STATUSES },
    };

    const [
      notesTotal,
      myNotes,
      due,
      openCases,
      myOpenCases,
      pinned,
      recent,
      followUps,
      stages,
      latest,
      taskCount,
      overdueTasks,
      tasks,
    ] = await Promise.all([
      this.db.note.count({ where: notes }),
      this.db.note.count({ where: { ...notes, userId: actor.id } }),
      this.db.note.count({ where: { ...notes, followUpAt: { lt: dueBy } } }),
      this.db.mortgageCase.count({ where: open }),
      this.db.mortgageCase.count({ where: { ...open, assignedAdviserId: actor.id } }),
      this.db.note.findMany({
        where: { ...notes, pinned: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: listSelect,
      }),
      this.db.note.findMany({
        where: notes,
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: listSelect,
      }),
      // Overdue, today and the coming week (Sydney days), soonest first.
      this.db.note.findMany({
        where: { ...notes, followUpAt: { lt: new Date(dueBy.getTime() + 7 * DAY_MS) } },
        orderBy: [{ followUpAt: "asc" }, { id: "asc" }],
        take: 8,
        select: listSelect,
      }),
      this.db.mortgageCase.groupBy({ by: ["stage"], where: open, _count: { _all: true } }),
      // Most recent note per client.
      this.db.note.findMany({
        where: { ...notes, clientId: { not: null } },
        orderBy: { updatedAt: "desc" },
        distinct: ["clientId"],
        take: 5,
        select: {
          updatedAt: true,
          client: {
            select: {
              id: true,
              name: true,
              _count: { select: { notes: { where: { deletedAt: null } } } },
            },
          },
        },
      }),
      this.db.task.count({ where: myOpenTasks }),
      this.db.task.count({ where: { ...myOpenTasks, dueAt: { lt: startOfZonedDay(now) } } }),
      this.db.task.findMany({
        where: myOpenTasks,
        orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
        take: 6,
        select: taskSelect,
      }),
    ]);

    const byStage = new Map(stages.map((s) => [s.stage, s._count._all]));
    return {
      counts: {
        notes: notesTotal,
        myNotes,
        followUpsDue: due,
        openCases,
        myOpenCases,
        myOpenTasks: taskCount,
        myOverdueTasks: overdueTasks,
      },
      myTasks: tasks.map((t) => toTaskDto(t, actor)),
      pinned: pinned.map((r) => toListItem(r, actor.id)),
      recent: recent.map((r) => toListItem(r, actor.id)),
      followUps: followUps.map((r) => toListItem(r, actor.id)),
      pipeline: CASE_STAGES.filter((s) => (OPEN_CASE_STAGES as string[]).includes(s.value)).map(
        (s) => ({ stage: s.value, count: byStage.get(s.value) ?? 0 }),
      ),
      recentClients: latest.flatMap((n) =>
        n.client
          ? [
              {
                id: n.client.id,
                name: n.client.name,
                noteCount: n.client._count.notes,
                lastNoteAt: n.updatedAt.toISOString(),
              },
            ]
          : [],
      ),
    };
  }
}

@ApiTags("dashboard")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: "Landing page data: counts, pinned/recent notes, follow-ups, case pipeline, clients",
  })
  get(@CurrentUser() user: SessionUser): Promise<DashboardDto> {
    return this.dashboard.get(user);
  }
}
