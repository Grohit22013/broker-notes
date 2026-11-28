import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp, loadDotEnv } from "../src/main";
import { PrismaService } from "../src/prisma/prisma.service";

/** Phase 9: mortgage cases, note ↔ case linking and the dashboard — over HTTP, real Postgres. */
const DOMAIN = "cases.brokernotes.test";
const email = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${DOMAIN}`;
const PASSWORD = "secure123";
const YEAR_RE = /^HL-\d{4}-\d{4}$/;

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
    .send({ name: "Case Admin", email: email("a"), password: PASSWORD, confirmPassword: PASSWORD })
    .expect(201);
  return { agent, id: res.body.id };
}

async function join(by: Member, role: "ADVISER" | "CASE_MANAGER"): Promise<Member> {
  const addr = email(role.toLowerCase());
  const invite = await by.agent
    .post("/organisation/invites")
    .send({ email: addr, role })
    .expect(201);
  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post("/auth/register")
    .send({
      name: "Sam",
      email: addr,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      inviteToken: invite.body.token,
    })
    .expect(201);
  return { agent, id: res.body.id };
}

const client = async (m: Member, name: string) =>
  (await m.agent.post("/clients").send({ name }).expect(201)).body.id as string;

describe("mortgage cases", () => {
  it("opens cases with sequential per-brokerage references and lists them", async () => {
    const a = await admin();
    const nguyen = await client(a, "Nguyen family");
    const first = await a.agent
      .post("/cases")
      .send({ clientId: nguyen, type: "FIRST_HOME", loanAmount: 680000.4, propertyValue: 850000 })
      .expect(201);
    expect(first.body).toMatchObject({
      type: "FIRST_HOME",
      stage: "ENQUIRY",
      loanAmount: 680000,
      client: { id: nguyen, name: "Nguyen family" },
      createdBy: { id: a.id },
      noteCount: 0,
    });
    expect(first.body.reference).toMatch(YEAR_RE);
    const second = await a.agent
      .post("/cases")
      .send({ clientId: nguyen, type: "REFINANCE" })
      .expect(201);
    const seq = (r: string) => Number(r.slice(-4));
    expect(seq(second.body.reference)).toBe(seq(first.body.reference) + 1);

    // Another brokerage starts its own sequence and can't see these.
    const b = await admin();
    const theirs = await b.agent
      .post("/cases")
      .send({ clientId: await client(b, "Other"), type: "PURCHASE" })
      .expect(201);
    expect(theirs.body.reference).toBe(first.body.reference);
    await b.agent.get(`/cases/${first.body.id}`).expect(404);
    await b.agent.patch(`/cases/${first.body.id}`).send({ stage: "LODGED" }).expect(404);
    await b.agent.post("/cases").send({ clientId: nguyen, type: "PURCHASE" }).expect(404);

    const listed = await a.agent.get(`/cases?q=${first.body.reference}`).expect(200);
    expect(listed.body.map((c: { id: string }) => c.id)).toEqual([first.body.id]);
    const byClient = await a.agent.get(`/cases?client=${nguyen}`).expect(200);
    expect(byClient.body).toHaveLength(2);
  });

  it("filters open vs done, and moves stages with an audit trail", async () => {
    const a = await admin();
    const c = (
      await a.agent
        .post("/cases")
        .send({ clientId: await client(a, "Patel"), type: "INVESTMENT" })
        .expect(201)
    ).body;
    await a.agent.patch(`/cases/${c.id}`).send({ stage: "SETTLED" }).expect(200);
    expect((await a.agent.get("/cases").expect(200)).body).toEqual([]);
    expect((await a.agent.get("/cases?status=done").expect(200)).body).toHaveLength(1);
    expect((await a.agent.get("/cases?stage=SETTLED").expect(200)).body).toHaveLength(1);

    const log = await a.agent.get("/audit?category=case").expect(200);
    expect(log.body.items.map((e: { summary: string }) => e.summary)).toEqual([
      `Moved ${c.reference} from Enquiry to Settled`,
      `Opened case ${c.reference} for Patel`,
    ]);
  });

  it("lets case managers move stages but not open cases or change details", async () => {
    const a = await admin();
    const cm = await join(a, "CASE_MANAGER");
    const c = (
      await a.agent
        .post("/cases")
        .send({ clientId: await client(a, "Smith"), type: "PURCHASE" })
        .expect(201)
    ).body;

    const moved = await cm.agent.patch(`/cases/${c.id}`).send({ stage: "LODGED" }).expect(200);
    expect(moved.body.stage).toBe("LODGED");
    const denied = await cm.agent
      .patch(`/cases/${c.id}`)
      .send({ stage: "ASSESSMENT", lender: "ANZ" })
      .expect(403);
    expect(denied.body.message).toMatch(/can't change its details/);
    await cm.agent.post("/cases").send({ clientId: c.client.id, type: "PURCHASE" }).expect(403);
    expect((await a.agent.get(`/cases/${c.id}`)).body.stage).toBe("LODGED");
  });

  it("assigns advisers only from the same brokerage", async () => {
    const a = await admin();
    const adviser = await join(a, "ADVISER");
    const other = await admin();
    const clientId = await client(a, "O'Brien");
    const c = await a.agent
      .post("/cases")
      .send({ clientId, type: "REFINANCE", assignedAdviserId: adviser.id })
      .expect(201);
    expect(c.body.assignedAdviser.id).toBe(adviser.id);
    await a.agent.patch(`/cases/${c.body.id}`).send({ assignedAdviserId: other.id }).expect(404);
    const mine = await adviser.agent.get("/cases?mine=1").expect(200);
    expect(mine.body.map((x: { id: string }) => x.id)).toEqual([c.body.id]);
  });
});

describe("notes ↔ cases", () => {
  it("links notes to a case (which sets the client), searches and filters by case", async () => {
    const a = await admin();
    const nguyen = await client(a, "Nguyen family");
    const smith = await client(a, "Smith");
    const c = (
      await a.agent.post("/cases").send({ clientId: nguyen, type: "FIRST_HOME" }).expect(201)
    ).body;

    // Created from the case: client comes from the case, even if another client is asked for.
    const fromCase = await a.agent
      .post("/notes")
      .send({ templateId: "discovery", caseId: c.id, clientId: smith })
      .expect(201);
    const note = await a.agent.get(`/notes/${fromCase.body.id}`).expect(200);
    expect(note.body.case).toEqual({ id: c.id, reference: c.reference });
    expect(note.body.client.id).toBe(nguyen);
    expect(note.body.title).toContain("Nguyen family");

    // Linking an existing note to the case also sets its client.
    const loose = (await a.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body.id;
    const meta = await a.agent.patch(`/notes/${loose}/meta`).send({ caseId: c.id }).expect(200);
    expect(meta.body).toMatchObject({ caseId: c.id, caseReference: c.reference, clientId: nguyen });

    // Moving it to another client drops the (now mismatched) case.
    const moved = await a.agent.patch(`/notes/${loose}/meta`).send({ clientId: smith }).expect(200);
    expect(moved.body).toMatchObject({ clientId: smith, caseId: null });

    const byCase = await a.agent.get(`/notes?case=${c.id}`).expect(200);
    expect(byCase.body.items.map((n: { id: string }) => n.id)).toEqual([fromCase.body.id]);
    const byRef = await a.agent.get(`/notes?q=${c.reference}`).expect(200);
    expect(byRef.body.items).toHaveLength(1);
    expect((await a.agent.get(`/cases/${c.id}`)).body.noteCount).toBe(1);

    // CSV export carries the case reference.
    const csv = await a.agent.get("/export/notes").expect(200);
    expect(csv.text).toContain("Title,Client,Case,Author");
    expect(csv.text).toContain(c.reference);
  });

  it("rejects another brokerage's case and keeps the link locked once finalised", async () => {
    const a = await admin();
    const b = await admin();
    const theirs = (
      await b.agent
        .post("/cases")
        .send({ clientId: await client(b, "X"), type: "PURCHASE" })
        .expect(201)
    ).body;
    const note = (await a.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body.id;
    await a.agent.patch(`/notes/${note}/meta`).send({ caseId: theirs.id }).expect(404);
    await a.agent.post("/notes").send({ templateId: "blank", caseId: theirs.id }).expect(404);

    await a.agent.post(`/notes/${note}/finalise`).expect(204);
    const mine = (
      await a.agent
        .post("/cases")
        .send({ clientId: await client(a, "Y"), type: "PURCHASE" })
        .expect(201)
    ).body;
    await a.agent.patch(`/notes/${note}/meta`).send({ caseId: mine.id }).expect(409);
  });
});

describe("dashboard", () => {
  it("summarises the brokerage for the signed-in member", async () => {
    const a = await admin();
    const adviser = await join(a, "ADVISER");
    const clientId = await client(a, "Nguyen family");
    const open = (
      await a.agent
        .post("/cases")
        .send({ clientId, type: "FIRST_HOME", stage: "LODGED", assignedAdviserId: adviser.id })
        .expect(201)
    ).body;
    await a.agent.post("/cases").send({ clientId, type: "REFINANCE", stage: "CLOSED" }).expect(201);

    const pinned = (
      await a.agent.post("/notes").send({ templateId: "blank", caseId: open.id }).expect(201)
    ).body.id;
    await a.agent
      .patch(`/notes/${pinned}/meta`)
      .send({ pinned: true, followUpDate: "2020-01-01" })
      .expect(200);
    await adviser.agent.post("/notes").send({ templateId: "blank" }).expect(201);

    const d = (await adviser.agent.get("/dashboard").expect(200)).body;
    expect(d.counts).toMatchObject({
      notes: 2,
      myNotes: 1,
      followUpsDue: 1,
      openCases: 1,
      myOpenCases: 1,
    });
    expect(d.pinned.map((n: { id: string }) => n.id)).toEqual([pinned]);
    expect(d.recent).toHaveLength(2);
    expect(d.followUps.map((n: { id: string }) => n.id)).toEqual([pinned]);
    expect(d.pipeline).toHaveLength(7); // open stages only
    expect(d.pipeline.find((p: { stage: string }) => p.stage === "LODGED").count).toBe(1);
    expect(d.recentClients).toEqual([
      expect.objectContaining({ id: clientId, name: "Nguyen family", noteCount: 1 }),
    ]);

    // Nothing from other brokerages.
    const other = await admin();
    expect((await other.agent.get("/dashboard").expect(200)).body.counts).toMatchObject({
      notes: 0,
      myNotes: 0,
      followUpsDue: 0,
      openCases: 0,
      myOpenCases: 0,
    });
  });
});
