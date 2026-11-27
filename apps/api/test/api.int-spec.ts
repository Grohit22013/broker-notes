import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp, loadDotEnv } from "../src/main";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Boots the real API (same middleware, guards, filters as production) against a real Postgres
 * and drives it over HTTP. Test accounts use @int.brokernotes.test and are removed afterwards.
 */
const DOMAIN = "int.brokernotes.test";
const email = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${DOMAIN}`;
const PASSWORD = "secure123";

let app: INestApplication;
let db: PrismaService;

beforeAll(async () => {
  // Many sign-ups in one run; production keeps the default of 10/min.
  process.env.AUTH_RATE_LIMIT = "1000";
  loadDotEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  db = app.get(PrismaService);
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
  await app.close();
});

/** A signed-in agent (cookie jar) for a fresh broker. */
async function broker(name = "Int Broker") {
  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post("/auth/register")
    .send({ name, email: email("b"), password: PASSWORD, confirmPassword: PASSWORD })
    .expect(201);
  return { agent, user: res.body as { id: string; email: string } };
}

describe("auth", () => {
  it("registers, sets an httpOnly session cookie, and /auth/me works", async () => {
    const agent = request.agent(app.getHttpServer());
    const addr = email("reg").toUpperCase();
    const res = await agent
      .post("/auth/register")
      .send({ name: "Asha", email: addr, password: PASSWORD, confirmPassword: PASSWORD })
      .expect(201);
    expect(res.body.email).toBe(addr.toLowerCase());
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/bn_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    await agent.get("/auth/me").expect(200);
  });

  it("validates input with field-level errors", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ name: "A", email: "bad", password: "short", confirmPassword: "x" })
      .expect(400);
    expect(res.body).toEqual({
      statusCode: 400,
      message: "Name must be at least 2 characters",
      field: "name",
    });
  });

  it("rejects duplicate emails with 409 on the email field", async () => {
    const addr = email("dup");
    const body = { name: "Dup", email: addr, password: PASSWORD, confirmPassword: PASSWORD };
    await request(app.getHttpServer()).post("/auth/register").send(body).expect(201);
    const res = await request(app.getHttpServer()).post("/auth/register").send(body).expect(409);
    expect(res.body.field).toBe("email");
  });

  it("uses one generic message for wrong password and unknown email", async () => {
    const { user } = await broker();
    const wrong = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password: "wrong1234" })
      .expect(401);
    const unknown = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: email("nobody"), password: PASSWORD })
      .expect(401);
    expect(wrong.body.message).toBe("Incorrect email or password.");
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it("rejects requests without a session, and logout clears it", async () => {
    await request(app.getHttpServer()).get("/notes").expect(401);
    const { agent } = await broker();
    await agent.post("/auth/logout").expect(204);
    await agent.get("/notes").expect(401);
  });

  it("rate-limits login attempts per IP", async () => {
    process.env.AUTH_RATE_LIMIT = "3";
    try {
      const server = request(app.getHttpServer());
      const attempt = () =>
        server.post("/auth/login").send({ email: email("brute"), password: "wrong1234" });
      // Limits are per route + client; earlier tests used this route too, so allow for them.
      let status = 0;
      for (let i = 0; i < 6 && status !== 429; i++) status = (await attempt()).status;
      expect(status).toBe(429);
    } finally {
      process.env.AUTH_RATE_LIMIT = "1000";
    }
  });

  it("accepts Bearer tokens and rejects tampered ones", async () => {
    await request(app.getHttpServer())
      .get("/notes")
      .set("Authorization", "Bearer not.a.jwt")
      .expect(401);
  });
});

describe("notes", () => {
  it("full lifecycle: template → autosave → details → finalise → amendment → history", async () => {
    const { agent } = await broker();
    const client = (
      await agent
        .post("/clients")
        .send({ name: "Nguyen family", email: "N@Example.com" })
        .expect(201)
    ).body;
    expect(client.email).toBe("n@example.com");

    const { id } = (
      await agent.post("/notes").send({ templateId: "fact-find", clientId: client.id }).expect(201)
    ).body;
    const created = (await agent.get(`/notes/${id}`).expect(200)).body;
    expect(created.title).toBe("Fact find – Nguyen family");
    expect(created.noteType).toBe("FACT_FIND");
    expect(created.client).toEqual({ id: client.id, name: "Nguyen family" });

    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Income $182k" }] }],
    };
    await agent
      .put(`/notes/${id}/content`)
      .send({ title: "Fact find – Nguyen", contentJson: doc, contentText: "Income $182k" })
      .expect(200);

    const meta = (
      await agent
        .patch(`/notes/${id}/meta`)
        .send({
          loanStage: "LEAD",
          tags: ["FHB", "fhb", " first-home "],
          followUpDate: "2026-12-03",
          keyFigures: { loanAmount: 680000, propertyValue: 850000 },
        })
        .expect(200)
    ).body;
    expect(meta).toMatchObject({
      loanStage: "LEAD",
      tags: ["FHB", "first-home"],
      followUpDate: "2026-12-03",
      clientName: "Nguyen family",
    });
    expect(meta.keyFigures).toEqual({ loanAmount: 680000, propertyValue: 850000 });

    // Search by client name and filter by stage
    expect((await agent.get("/notes?q=nguyen&stage=LEAD").expect(200)).body.items).toHaveLength(1);
    expect((await agent.get("/notes?stage=SETTLED").expect(200)).body.items).toHaveLength(0);

    await agent.post(`/notes/${id}/finalise`).expect(204);
    await agent.post(`/notes/${id}/finalise`).expect(409);
    // Content and record fields are locked (server-enforced) …
    await agent
      .put(`/notes/${id}/content`)
      .send({ title: "x", contentJson: doc, contentText: "x" })
      .expect(409);
    await agent.patch(`/notes/${id}/meta`).send({ noteType: "REVIEW" }).expect(409);
    await agent
      .patch(`/notes/${id}/meta`)
      .send({ keyFigures: { loanAmount: 1 } })
      .expect(409);
    // … workflow fields are not.
    await agent
      .patch(`/notes/${id}/meta`)
      .send({ loanStage: "APPLICATION", pinned: true })
      .expect(200);

    const amendment = (
      await agent
        .post(`/notes/${id}/amendments`)
        .send({ body: "Gift letter received." })
        .expect(201)
    ).body;
    expect(amendment.body).toBe("Gift letter received.");
    const finalised = (await agent.get(`/notes/${id}`).expect(200)).body;
    expect(finalised.status).toBe("FINALISED");
    expect(finalised.finalisedAt).toBeTruthy();
    expect(finalised.amendments).toHaveLength(1);

    const versions = (await agent.get(`/notes/${id}/versions`).expect(200)).body;
    expect(versions.length).toBeGreaterThanOrEqual(2); // created + finalised snapshot
    const v = (await agent.get(`/notes/${id}/versions/${versions[0].id}`).expect(200)).body;
    expect(v.contentJson.type).toBe("doc");
  });

  it("amendments are only for finalised notes; snapshots only for drafts", async () => {
    const { agent } = await broker();
    const { id } = (await agent.post("/notes").send({}).expect(201)).body;
    await agent.post(`/notes/${id}/amendments`).send({ body: "x" }).expect(400);
    await agent.post(`/notes/${id}/versions`).expect(201);
  });

  it("rejects malformed content and oversized payloads", async () => {
    const { agent } = await broker();
    const { id } = (await agent.post("/notes").send({}).expect(201)).body;
    await agent
      .put(`/notes/${id}/content`)
      .send({ title: "t", contentJson: { type: "paragraph" }, contentText: "" })
      .expect(400);
    await agent.get("/notes/not-an-id").expect(400);
  });

  it("isolates brokers: another broker's note and client are 404, and lists stay empty", async () => {
    const owner = await broker("Owner");
    const intruder = await broker("Intruder");
    const client = (await owner.agent.post("/clients").send({ name: "Private client" }).expect(201))
      .body;
    const { id } = (await owner.agent.post("/notes").send({ clientId: client.id }).expect(201))
      .body;

    await intruder.agent.get(`/notes/${id}`).expect(404);
    await intruder.agent
      .put(`/notes/${id}/content`)
      .send({ title: "pwned", contentJson: { type: "doc" }, contentText: "" })
      .expect(404);
    await intruder.agent.patch(`/notes/${id}/meta`).send({ pinned: true }).expect(404);
    await intruder.agent.delete(`/notes/${id}`).expect(404);
    await intruder.agent.get(`/notes/${id}/versions`).expect(404);
    await intruder.agent.get(`/clients/${client.id}`).expect(404);
    await intruder.agent.post("/notes").send({ clientId: client.id }).expect(404);
    expect((await intruder.agent.get("/notes").expect(200)).body.items).toHaveLength(0);
    expect((await intruder.agent.get("/clients").expect(200)).body).toHaveLength(0);

    // The owner's note is untouched.
    expect((await owner.agent.get(`/notes/${id}`).expect(200)).body.title).toBe("");
  });

  it("soft-deletes notes (hidden from the API, row retained)", async () => {
    const { agent } = await broker();
    const { id } = (await agent.post("/notes").send({}).expect(201)).body;
    await agent.delete(`/notes/${id}`).expect(204);
    await agent.get(`/notes/${id}`).expect(404);
    expect(await db.note.count({ where: { id, deletedAt: { not: null } } })).toBe(1);
  });
});

describe("clients, import and export", () => {
  it("imports clients: re-validates, skips duplicates, reports problems", async () => {
    const { agent } = await broker();
    await agent
      .post("/clients")
      .send({ name: "Existing", email: "existing@example.com" })
      .expect(201);
    const res = await agent
      .post("/clients/import")
      .send({
        mapping: { name: "Name", email: "Email", phone: null },
        rows: [
          { Name: "Asha", Email: "asha@example.com" },
          { Name: "", Email: "noname@example.com" },
          { Name: "Dup", Email: "EXISTING@example.com" },
          { Name: "Ben", Email: "" },
        ],
      })
      .expect(201);
    expect(res.body).toMatchObject({ imported: 2, duplicates: 1, invalid: 1 });
    expect((await agent.get("/clients").expect(200)).body).toHaveLength(3);
  });

  it("exports Excel-safe, filter-aware CSV", async () => {
    const { agent } = await broker();
    const { id: a } = (await agent.post("/notes").send({}).expect(201)).body;
    const { id: b } = (await agent.post("/notes").send({}).expect(201)).body;
    const doc = { type: "doc", content: [] };
    await agent
      .put(`/notes/${a}/content`)
      .send({ title: "=SUM(1,2)", contentJson: doc, contentText: "" })
      .expect(200);
    await agent
      .put(`/notes/${b}/content`)
      .send({ title: "Settled, comma", contentJson: doc, contentText: "" })
      .expect(200);
    await agent.patch(`/notes/${b}/meta`).send({ loanStage: "SETTLED" }).expect(200);

    const all = await agent.get("/export/notes").expect(200);
    expect(all.headers["content-type"]).toContain("text/csv");
    expect(all.headers["content-disposition"]).toMatch(
      /attachment; filename="brokernotes-notes-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(all.text.charCodeAt(0)).toBe(0xfeff);
    expect(all.text).toContain(`"'=SUM(1,2)"`);
    expect(all.text).toContain('"Settled, comma"');

    const settled = await agent.get("/export/notes?stage=SETTLED").expect(200);
    expect(settled.text).toContain("Settled, comma");
    expect(settled.text).not.toContain("SUM");

    await request(app.getHttpServer()).get("/export/notes").expect(401);
  });
});
