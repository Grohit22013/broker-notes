import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp, loadDotEnv } from "../src/main";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * AI analysis through the real API with the deterministic mock provider (no network, no quota).
 * The mock echoes the text it "received", which lets us prove redaction happens server-side.
 */
const DOMAIN = "ai-int.brokernotes.test";
const email = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${DOMAIN}`;
const PASSWORD = "secure123";

let app: INestApplication;
let db: PrismaService;

beforeAll(async () => {
  process.env.AUTH_RATE_LIMIT = "1000";
  process.env.AI_PROVIDER = "mock";
  process.env.AI_BURST_LIMIT = "1000"; // many analyses from one IP in this suite
  loadDotEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  db = app.get(PrismaService);
});

afterAll(async () => {
  // Deleting the brokerage cascades to its members, clients, notes and audit log.
  await db.organisation.deleteMany({
    where: { members: { some: { email: { endsWith: `@${DOMAIN}` } } } },
  });
  await app.close();
});

async function broker() {
  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post("/auth/register")
    .send({ name: "AI Broker", email: email("ai"), password: PASSWORD, confirmPassword: PASSWORD })
    .expect(201);
  return { agent, userId: res.body.id as string };
}

const SENSITIVE =
  "Discovery call. TFN 123 456 782, mobile 0412 345 678, email asha@example.com. " +
  "Loan about $680k on an $850k property, income $182k, ANZ at 6.04%.";

async function noteWith(agent: request.Agent, text: string, title = "Discovery – Patel") {
  const { id } = (await agent.post("/notes").send({}).expect(201)).body;
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
  await agent
    .put(`/notes/${id}/content`)
    .send({ title, contentJson: doc, contentText: text })
    .expect(200);
  return id as string;
}

describe("AI analysis (mock provider)", () => {
  it("reports status with a free model and the daily quota", async () => {
    const { agent } = await broker();
    const s = (await agent.get("/ai/status").expect(200)).body;
    expect(s).toMatchObject({ enabled: true, dailyLimit: 20, usedToday: 0, remaining: 20 });
    expect(s.model).toMatch(/:free$/);
  });

  it("redacts identifiers before sending, returns a structured analysis, and caches it", async () => {
    const { agent } = await broker();
    const id = await noteWith(agent, SENSITIVE);
    const before = (await agent.get(`/notes/${id}`).expect(200)).body.updatedAt;

    const first = (await agent.post(`/notes/${id}/analysis`).send({}).expect(200)).body;
    expect(first.cached).toBe(false);
    expect(first.model).toMatch(/:free$/);
    expect(first.redactions).toEqual({ tfn: 1, medicare: 0, card: 0, bank: 0, phone: 1, email: 1 });
    // What the provider received (echoed by the mock) contains placeholders, never the raw values.
    expect(first.analysis.summary).toContain("[TFN removed]");
    expect(first.analysis.summary).not.toMatch(/123 456 782|0412 345 678|asha@example\.com/);
    expect(first.analysis.keyFigures).toMatchObject({ loanAmount: 680000, lender: "ANZ" });
    expect(first.analysis.actionItems.length).toBeGreaterThan(0);
    expect(first.remaining).toBe(19);

    // Analysing isn't editing: "last edited" is unchanged.
    expect((await agent.get(`/notes/${id}`).expect(200)).body.updatedAt).toBe(before);

    // Unchanged note → cached, no quota used.
    const second = (await agent.post(`/notes/${id}/analysis`).send({}).expect(200)).body;
    expect(second.cached).toBe(true);
    expect(second.remaining).toBe(19);

    // force → fresh call.
    const forced = (await agent.post(`/notes/${id}/analysis`).send({ force: true }).expect(200))
      .body;
    expect(forced.cached).toBe(false);
    expect(forced.remaining).toBe(18);
  });

  it("flags the stored analysis as stale after the note changes", async () => {
    const { agent } = await broker();
    const id = await noteWith(agent, SENSITIVE);
    await agent.post(`/notes/${id}/analysis`).send({}).expect(200);
    expect((await agent.get(`/notes/${id}/analysis`).expect(200)).body.stale).toBe(false);

    const doc = { type: "doc", content: [] };
    await agent
      .put(`/notes/${id}/content`)
      .send({ title: "Changed", contentJson: doc, contentText: `${SENSITIVE} Updated.` })
      .expect(200);
    expect((await agent.get(`/notes/${id}/analysis`).expect(200)).body.stale).toBe(true);
  });

  it("refuses notes that are too short, and other brokers' notes", async () => {
    const owner = await broker();
    const intruder = await broker();
    const short = await noteWith(owner.agent, "Hi");
    await owner.agent.post(`/notes/${short}/analysis`).send({}).expect(400);

    const id = await noteWith(owner.agent, SENSITIVE);
    await intruder.agent.post(`/notes/${id}/analysis`).send({}).expect(404);
    await intruder.agent.get(`/notes/${id}/analysis`).expect(404);
  });

  it("enforces the daily limit (429) and works on finalised notes", async () => {
    const { agent, userId } = await broker();
    const id = await noteWith(agent, SENSITIVE);
    await agent.post(`/notes/${id}/finalise`).expect(204);
    // Finalised notes can still be analysed (read-only use).
    await agent.post(`/notes/${id}/analysis`).send({}).expect(200);

    await db.aiUsage.createMany({
      data: Array.from({ length: 19 }, () => ({ userId, model: "test:free", ok: true })),
    });
    const res = await agent.post(`/notes/${id}/analysis`).send({ force: true }).expect(429);
    expect(res.body.message).toMatch(/all 20 AI analyses/);
    expect((await agent.get("/ai/status").expect(200)).body.remaining).toBe(0);
  });
});
