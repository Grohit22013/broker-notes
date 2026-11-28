import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { toIsoDate } from "@broker-notes/shared/dates";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp, loadDotEnv } from "../src/main";
import { PrismaService } from "../src/prisma/prisma.service";

/** Phase 12: meeting times, the calendar feed and AI date spotting (mock provider). */
const DOMAIN = "calendar.brokernotes.test";
const email = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${DOMAIN}`;
const PASSWORD = "secure123";
const DAY = 86_400_000;
const day = (offset: number) => toIsoDate(new Date(Date.now() + offset * DAY));

let app: INestApplication;
let db: PrismaService;

beforeAll(async () => {
  process.env.AUTH_RATE_LIMIT = "1000";
  process.env.AI_PROVIDER = "mock";
  process.env.AI_BURST_LIMIT = "1000";
  loadDotEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  db = app.get(PrismaService);
});

afterAll(async () => {
  await db.organisation.deleteMany({
    where: { members: { some: { email: { endsWith: `@${DOMAIN}` } } } },
  });
  await app.close();
});

async function broker() {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post("/auth/register")
    .send({ name: "Cal Broker", email: email("b"), password: PASSWORD, confirmPassword: PASSWORD })
    .expect(201);
  return agent;
}

describe("meeting times", () => {
  it("stores a Sydney wall-clock time and returns it unchanged", async () => {
    const a = await broker();
    const id = (await a.post("/notes").send({ templateId: "blank" }).expect(201)).body.id;
    const meta = await a
      .patch(`/notes/${id}/meta`)
      .send({ meetingAt: "2026-12-03T14:30" })
      .expect(200);
    expect(meta.body.meetingAt).toBe("2026-12-03T14:30");
    const note = (await a.get(`/notes/${id}`).expect(200)).body;
    expect(note.meetingAt).toBe("2026-12-03T03:30:00.000Z"); // AEDT = UTC+11
    await a.patch(`/notes/${id}/meta`).send({ meetingAt: "3 Dec" }).expect(400);
    expect(
      (await a.patch(`/notes/${id}/meta`).send({ meetingAt: null })).body.meetingAt,
    ).toBeNull();
  });

  it("starts client-meeting notes at 'now' and locks the time once finalised", async () => {
    const a = await broker();
    const id = (await a.post("/notes").send({ templateId: "client-meeting" }).expect(201)).body.id;
    const meta = (await a.get(`/notes/${id}`).expect(200)).body;
    expect(meta.meetingAt).not.toBeNull();
    expect(Math.abs(Date.parse(meta.meetingAt) - Date.now())).toBeLessThan(16 * 60_000);
    await a.post(`/notes/${id}/finalise`).expect(204);
    await a.patch(`/notes/${id}/meta`).send({ meetingAt: "2026-12-03T09:00" }).expect(409);
  });
});

describe("calendar feed", () => {
  it("returns meetings, follow-ups and open tasks in order, with links", async () => {
    const a = await broker();
    const client = (await a.post("/clients").send({ name: "Nguyen family" }).expect(201)).body;
    const note = (
      await a.post("/notes").send({ templateId: "blank", clientId: client.id }).expect(201)
    ).body.id;
    await a
      .patch(`/notes/${note}/meta`)
      .send({ meetingAt: `${day(2)}T09:15`, followUpDate: day(-1) })
      .expect(200);
    await a
      .post("/tasks")
      .send({ title: "Chase payslips", noteId: note, dueDate: day(2) })
      .expect(201);
    await a
      .post("/tasks")
      .send({ title: "Loose task", dueDate: day(3) })
      .expect(201);
    const done = (await a.post("/tasks").send({ title: "Done already", dueDate: day(2) })).body;
    await a.patch(`/tasks/${done.id}`).send({ status: "COMPLETED" }).expect(200);

    const cal = (await a.get(`/calendar?from=${day(-5)}&to=${day(5)}`).expect(200)).body;
    expect(
      cal.items.map((i: { kind: string; date: string; title: string }) => [
        i.kind,
        i.date,
        i.title,
      ]),
    ).toEqual([
      ["follow_up", day(-1), "Untitled note"],
      ["meeting", day(2), "Untitled note"],
      ["task", day(2), "Chase payslips"],
      ["task", day(3), "Loose task"],
    ]);
    const [followUp, meeting, linkedTask, looseTask] = cal.items;
    expect(followUp).toMatchObject({
      overdue: true,
      href: `/notes/${note}`,
      clientName: "Nguyen family",
    });
    expect(meeting).toMatchObject({ time: "09:15", overdue: false });
    expect(linkedTask.href).toBe(`/notes/${note}`);
    expect(looseTask.href).toBe("/tasks?view=all&q=Loose%20task");
  });

  it("validates the range and stays inside the brokerage", async () => {
    const a = await broker();
    await a.get(`/calendar?from=${day(0)}`).expect(400);
    await a.get(`/calendar?from=${day(5)}&to=${day(0)}`).expect(400);
    await a.get(`/calendar?from=${day(0)}&to=${day(90)}`).expect(400);
    const id = (await a.post("/notes").send({ templateId: "blank" }).expect(201)).body.id;
    await a
      .patch(`/notes/${id}/meta`)
      .send({ meetingAt: `${day(1)}T10:00` })
      .expect(200);
    const b = await broker();
    expect((await b.get(`/calendar?from=${day(0)}&to=${day(7)}`).expect(200)).body.items).toEqual(
      [],
    );
  });
});

describe("AI date spotting", () => {
  it("returns dates resolved from 'today' alongside the analysis", async () => {
    const a = await broker();
    const id = (await a.post("/notes").send({ templateId: "blank" }).expect(201)).body.id;
    await a
      .put(`/notes/${id}/content`)
      .send({
        title: "Call with the Patels",
        contentJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Call back next week about payslips." }],
            },
          ],
        },
        contentText: "Call back next week about payslips.",
      })
      .expect(200);
    const res = await a.post(`/notes/${id}/analysis`).send({}).expect(200);
    expect(res.body.analysis.dates).toEqual([
      { kind: "follow_up", date: day(3), time: null, label: "Call back about payslips (mock)" },
      { kind: "meeting", date: day(3), time: "10:30", label: "Meet the ANZ BDM (mock)" },
    ]);
  });
});
