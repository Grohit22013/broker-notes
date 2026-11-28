import { BadRequestException, Controller, Get, Injectable, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CALENDAR_MAX_DAYS } from "@broker-notes/shared/calendar";
import {
  parseIsoDate,
  startOfNextZonedDay,
  startOfZonedDay,
  toIsoDate,
  toLocalTime,
  zonedMidnight,
} from "@broker-notes/shared/dates";
import type { CalendarDto, CalendarItemDto } from "@broker-notes/shared/dto";
import { displayTitle } from "@broker-notes/shared/notes/content";
import { OPEN_TASK_STATUSES } from "@broker-notes/shared/tasks/taxonomy";
import { z } from "zod";

import { CurrentUser, type SessionUser } from "../auth/auth.guard";
import { ZodPipe } from "../common/zod";
import { SESSION_COOKIE } from "../config";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 86_400_000;
const isoDay = z.string().refine((v) => parseIsoDate(v) !== null, { error: "Use YYYY-MM-DD" });
const rangeSchema = z.object({ from: isoDay, to: isoDay });

const KIND_ORDER: Record<CalendarItemDto["kind"], number> = { meeting: 0, follow_up: 1, task: 2 };

/** Meetings, follow-ups and open tasks in a date range, for the brokerage. */
@Injectable()
export class CalendarService {
  constructor(private readonly db: PrismaService) {}

  async range(
    actor: SessionUser,
    from: string,
    to: string,
    now = new Date(),
  ): Promise<CalendarDto> {
    const start = zonedMidnight(parseIsoDate(from)!);
    const end = startOfNextZonedDay(zonedMidnight(parseIsoDate(to)!)); // inclusive "to"
    if (end <= start) throw new BadRequestException("'to' must be on or after 'from'");
    if ((end.getTime() - start.getTime()) / DAY_MS > CALENDAR_MAX_DAYS + 1) {
      throw new BadRequestException(`At most ${CALENDAR_MAX_DAYS} days at a time`);
    }
    const org = actor.organisationId;
    const today = startOfZonedDay(now);
    const notes = { organisationId: org, deletedAt: null };
    const client = { select: { name: true } };

    const [meetings, followUps, tasks] = await Promise.all([
      this.db.note.findMany({
        where: { ...notes, meetingAt: { gte: start, lt: end } },
        select: { id: true, title: true, meetingAt: true, client },
        take: 500,
      }),
      this.db.note.findMany({
        where: { ...notes, followUpAt: { gte: start, lt: end } },
        select: { id: true, title: true, followUpAt: true, client },
        take: 500,
      }),
      this.db.task.findMany({
        where: {
          organisationId: org,
          status: { in: OPEN_TASK_STATUSES },
          dueAt: { gte: start, lt: end },
        },
        select: {
          id: true,
          title: true,
          dueAt: true,
          noteId: true,
          client,
          note: { select: { deletedAt: true } },
        },
        take: 500,
      }),
    ]);

    const items: CalendarItemDto[] = [
      ...meetings.map((n) => ({
        kind: "meeting" as const,
        date: toIsoDate(n.meetingAt!),
        time: toLocalTime(n.meetingAt!),
        title: displayTitle(n.title),
        href: `/notes/${n.id}`,
        clientName: n.client?.name ?? null,
        overdue: false,
      })),
      ...followUps.map((n) => ({
        kind: "follow_up" as const,
        date: toIsoDate(n.followUpAt!),
        time: null,
        title: displayTitle(n.title),
        href: `/notes/${n.id}`,
        clientName: n.client?.name ?? null,
        overdue: n.followUpAt! < today,
      })),
      ...tasks.map((t) => ({
        kind: "task" as const,
        date: toIsoDate(t.dueAt!),
        time: null,
        title: t.title,
        // Tasks don't have their own page: open the note they came from, else search Tasks.
        href:
          t.noteId && !t.note?.deletedAt
            ? `/notes/${t.noteId}`
            : `/tasks?view=all&q=${encodeURIComponent(t.title.slice(0, 100))}`,
        clientName: t.client?.name ?? null,
        overdue: t.dueAt! < today,
      })),
    ].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time ?? "99").localeCompare(b.time ?? "99") ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
    );
    return { from, to, items };
  }
}

@ApiTags("calendar")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @ApiOperation({
    summary: "Meetings, follow-ups and open tasks between two dates (inclusive, Sydney days)",
    description: `Query: from=YYYY-MM-DD, to=YYYY-MM-DD (at most ${CALENDAR_MAX_DAYS} days).`,
  })
  get(
    @CurrentUser() user: SessionUser,
    @Query(new ZodPipe(rangeSchema)) q: z.output<typeof rangeSchema>,
  ): Promise<CalendarDto> {
    return this.calendar.range(user, q.from, q.to);
  }
}
