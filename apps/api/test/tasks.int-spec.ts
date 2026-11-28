import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { toIsoDate } from "@broker-notes/shared/dates";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp, loadDotEnv } from "../src/main";
import { PrismaService } from "../src/prisma/prisma.service";

/** Phase 10: follow-up tasks — over HTTP against a real Postgres. */
const DOMAIN = "tasks.brokernotes.test";
const email = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${DOMAIN}`;
const PASSWORD = "secure123";
const DAY = 86_400_000;
const day = (offset: number) => toIsoDate(new Date(Date.now() + offset * DAY));

let app: INestApplication;
let db: PrismaService;

beforeAll(async () => {
  process.env.AUTH_RATE_LIMIT = "1000";
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

type Member = { agent: ReturnType<typeof request.agent>; id: string };

async function admin(): Promise<Member> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post("/auth/register")
    .send({ name: "Task Admin", email: email("a"), password: PASSWORD, confirmPassword: PASSWORD })
    .expect(201);
  return { agent, id: res.body.id };
}

async function join(by: Member, role: "ADVISER" | "CASE_MANAGER", name: string): Promise<Member> {
  const addr = email(role.toLowerCase());
  const invite = await by.agent
    .post("/organisation/invites")
    .send({ email: addr, role })
    .expect(201);
  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post("/auth/register")
    .send({
      name,
      email: addr,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      inviteToken: invite.body.token,
    })
    .expect(201);
  return { agent, id: res.body.id };
}

const ids = (res: { body: { id: string }[] }) => res.body.map((t) => t.id);

describe("tasks", () => {
  it("creates tasks whose links stay consistent (note → case → client)", async () => {
    const a = await admin();
    const client = (await a.agent.post("/clients").send({ name: "Nguyen family" }).expect(201))
      .body;
    const c = (
      await a.agent.post("/cases").send({ clientId: client.id, type: "FIRST_HOME" }).expect(201)
    ).body;
    const note = (
      await a.agent.post("/notes").send({ templateId: "blank", caseId: c.id }).expect(201)
    ).body;

    const fromNote = await a.agent
      .post("/tasks")
      .send({ title: "  Request 3 payslips ", noteId: note.id, dueDate: day(2), priority: "HIGH" })
      .expect(201);
    expect(fromNote.body).toMatchObject({
      title: "Request 3 payslips",
      status: "PENDING",
      priority: "HIGH",
      dueDate: day(2),
      note: { id: note.id },
      case: { id: c.id, reference: c.reference },
      client: { id: client.id, name: "Nguyen family" },
      createdBy: { id: a.id },
      assignee: null,
      canChange: true,
    });

    // A case brings its client even if another one is asked for.
    const other = (await a.agent.post("/clients").send({ name: "Other" }).expect(201)).body;
    const fromCase = await a.agent
      .post("/tasks")
      .send({ title: "Order valuation", caseId: c.id, clientId: other.id })
      .expect(201);
    expect(fromCase.body.client.id).toBe(client.id);

    expect(ids(await a.agent.get(`/tasks?case=${c.id}`).expect(200))).toEqual([
      fromNote.body.id, // due first
      fromCase.body.id, // no due date: last
    ]);
    expect(ids(await a.agent.get(`/tasks?note=${note.id}`).expect(200))).toEqual([
      fromNote.body.id,
    ]);
  });

  it("creates tasks in a batch from a note, with one audit entry", async () => {
    const a = await admin();
    const note = (await a.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body;
    const res = await a.agent
      .post("/tasks/batch")
      .send({ noteId: note.id, titles: ["Send fact find", "Chase gift letter"], assigneeId: a.id })
      .expect(201);
    expect(res.body.created).toBe(2);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual([
      "Send fact find",
      "Chase gift letter",
    ]);
    const log = await a.agent.get("/audit?category=task").expect(200);
    expect(log.body.items.map((e: { summary: string }) => e.summary)).toEqual([
      "Created 2 tasks from “Untitled note”",
    ]);
  });

  it("filters by assignee, due window and status, and completes/reopens with an audit trail", async () => {
    const a = await admin();
    const priya = await join(a, "ADVISER", "Priya");
    const overdue = (
      await a.agent
        .post("/tasks")
        .send({ title: "Overdue", dueDate: day(-3), assigneeId: priya.id })
        .expect(201)
    ).body;
    const today = (
      await a.agent.post("/tasks").send({ title: "Today", dueDate: day(0), assigneeId: priya.id })
    ).body;
    const later = (await a.agent.post("/tasks").send({ title: "Later", dueDate: day(30) })).body;

    expect(ids(await priya.agent.get("/tasks?assignee=me").expect(200))).toEqual([
      overdue.id,
      today.id,
    ]);
    expect(ids(await a.agent.get("/tasks?assignee=unassigned"))).toEqual([later.id]);
    expect(ids(await a.agent.get("/tasks?due=overdue"))).toEqual([overdue.id]);
    expect(ids(await a.agent.get("/tasks?due=today"))).toEqual([today.id]);
    expect(ids(await a.agent.get("/tasks?due=week"))).toEqual([overdue.id, today.id]);
    expect(ids(await a.agent.get("/tasks?q=lat"))).toEqual([later.id]);

    // The assignee completes it; it leaves the open list.
    const done = await priya.agent
      .patch(`/tasks/${overdue.id}`)
      .send({ status: "COMPLETED" })
      .expect(200);
    expect(done.body.status).toBe("COMPLETED");
    expect(done.body.completedAt).not.toBeNull();
    expect(ids(await a.agent.get("/tasks"))).not.toContain(overdue.id);
    expect(ids(await a.agent.get("/tasks?status=done"))).toEqual([overdue.id]);

    const reopened = await priya.agent
      .patch(`/tasks/${overdue.id}`)
      .send({ status: "PENDING" })
      .expect(200);
    expect(reopened.body.completedAt).toBeNull();

    await a.agent.patch(`/tasks/${later.id}`).send({ assigneeId: priya.id }).expect(200);
    const log = await a.agent.get("/audit?category=task").expect(200);
    expect(log.body.items.slice(0, 3).map((e: { summary: string }) => e.summary)).toEqual([
      "Assigned “Later” to Priya",
      "Reopened “Overdue”",
      "Completed “Overdue”",
    ]);
  });

  it("lets only the creator, the assignee or an admin change a task", async () => {
    const a = await admin();
    const priya = await join(a, "ADVISER", "Priya");
    const sam = await join(a, "CASE_MANAGER", "Sam");
    // Case managers can create tasks…
    const t = (
      await sam.agent
        .post("/tasks")
        .send({ title: "Chase payslips", assigneeId: priya.id })
        .expect(201)
    ).body;
    const other = await join(a, "ADVISER", "Other");

    const viewed = await other.agent.get(`/tasks/${t.id}`).expect(200);
    expect(viewed.body.canChange).toBe(false);
    const denied = await other.agent
      .patch(`/tasks/${t.id}`)
      .send({ status: "COMPLETED" })
      .expect(403);
    expect(denied.body.message).toMatch(/creator, its assignee or a brokerage admin/);

    await sam.agent.patch(`/tasks/${t.id}`).send({ priority: "HIGH" }).expect(200); // creator
    await priya.agent.patch(`/tasks/${t.id}`).send({ status: "IN_PROGRESS" }).expect(200); // assignee
    await a.agent.patch(`/tasks/${t.id}`).send({ status: "CANCELLED" }).expect(200); // admin
  });

  it("keeps tasks inside the brokerage", async () => {
    const a = await admin();
    const b = await admin();
    const t = (await a.agent.post("/tasks").send({ title: "Private" }).expect(201)).body;
    const theirNote = (await b.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body;

    await b.agent.get(`/tasks/${t.id}`).expect(404);
    await b.agent.patch(`/tasks/${t.id}`).send({ status: "COMPLETED" }).expect(404);
    expect((await b.agent.get("/tasks").expect(200)).body).toEqual([]);
    await a.agent.post("/tasks").send({ title: "x", noteId: theirNote.id }).expect(404);
    await a.agent.post("/tasks").send({ title: "x", assigneeId: b.id }).expect(404);
    await a.agent
      .post("/tasks/batch")
      .send({ noteId: theirNote.id, titles: ["x"] })
      .expect(404);
  });

  it("shows my open tasks on the dashboard", async () => {
    const a = await admin();
    await a.agent
      .post("/tasks")
      .send({ title: "Mine overdue", dueDate: day(-1), assigneeId: a.id });
    await a.agent.post("/tasks").send({ title: "Mine later", assigneeId: a.id });
    await a.agent.post("/tasks").send({ title: "Not mine" });
    const d = (await a.agent.get("/dashboard").expect(200)).body;
    expect(d.counts).toMatchObject({ myOpenTasks: 2, myOverdueTasks: 1 });
    expect(d.myTasks.map((t: { title: string }) => t.title)).toEqual([
      "Mine overdue",
      "Mine later",
    ]);
  });
});
