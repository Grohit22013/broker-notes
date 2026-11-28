import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp, loadDotEnv } from "../src/main";
import { PrismaService } from "../src/prisma/prisma.service";

/** Phase 11: edit conflicts, favourites, drafts filter and brokerage templates. */
const DOMAIN = "editor.brokernotes.test";
const email = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${DOMAIN}`;
const PASSWORD = "secure123";

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
    .send({ name: "Ed Admin", email: email("a"), password: PASSWORD, confirmPassword: PASSWORD })
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

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const save = (m: Member, id: string, text: string, baseRevision?: number) =>
  m.agent
    .put(`/notes/${id}/content`)
    .send({ title: text, contentJson: doc(text), contentText: text, baseRevision });

describe("edit conflicts", () => {
  it("refuses a save based on an old revision and returns the latest version", async () => {
    const a = await admin();
    const id = (await a.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body.id;
    const opened = (await a.agent.get(`/notes/${id}`).expect(200)).body;
    expect(opened.revision).toBe(1);

    // Tab 1 saves on top of revision 1 → revision 2.
    const first = await save(a, id, "Tab one", 1).expect(200);
    expect(first.body.revision).toBe(2);
    // …and keeps going from its own latest revision.
    expect((await save(a, id, "Tab one again", 2).expect(200)).body.revision).toBe(3);

    // Tab 2 still thinks it's on revision 1: refused, nothing overwritten.
    const conflict = await save(a, id, "Tab two", 1).expect(409);
    expect(conflict.body).toMatchObject({
      code: "NOTE_CONFLICT",
      latest: { revision: 3, title: "Tab one again", contentJson: doc("Tab one again") },
    });
    expect(conflict.body.message).toMatch(/changed in another tab/);
    expect((await a.agent.get(`/notes/${id}`)).body.title).toBe("Tab one again");

    // Choosing "keep mine" = saving on top of the latest revision.
    expect((await save(a, id, "Tab two wins", 3).expect(200)).body.revision).toBe(4);
  });

  it("protects against a colleague's concurrent edit too (admin vs author)", async () => {
    const a = await admin();
    const adviser = await join(a, "ADVISER");
    const id = (await adviser.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body
      .id;
    await save(adviser, id, "Adviser draft", 1).expect(200);
    await save(a, id, "Admin edit on stale copy", 1).expect(409);
  });
});

describe("favourites and drafts", () => {
  it("stars notes per member and filters by favourites and drafts", async () => {
    const a = await admin();
    const cm = await join(a, "CASE_MANAGER");
    const one = (await a.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body.id;
    const two = (await a.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body.id;

    await a.agent.put(`/notes/${one}/favourite`).expect(204);
    await a.agent.put(`/notes/${one}/favourite`).expect(204); // idempotent
    // Anyone who can read a note can star it — case managers included.
    await cm.agent.put(`/notes/${two}/favourite`).expect(204);

    const mine = (await a.agent.get("/notes?fav=1").expect(200)).body.items;
    expect(mine.map((n: { id: string }) => n.id)).toEqual([one]);
    expect(mine[0].favourite).toBe(true);
    const all = (await a.agent.get("/notes").expect(200)).body.items;
    expect(all.find((n: { id: string }) => n.id === two).favourite).toBe(false); // personal

    await a.agent.delete(`/notes/${one}/favourite`).expect(204);
    expect((await a.agent.get("/notes?fav=1")).body.items).toEqual([]);

    await a.agent.post(`/notes/${two}/finalise`).expect(204);
    const drafts = (await a.agent.get("/notes?drafts=1")).body.items.map(
      (n: { id: string }) => n.id,
    );
    expect(drafts).toEqual([one]);

    const other = await admin();
    await other.agent.put(`/notes/${one}/favourite`).expect(404);
  });
});

describe("brokerage templates", () => {
  it("saves a note as a template, creates notes from it, and archives it", async () => {
    const a = await admin();
    const cm = await join(a, "CASE_MANAGER");
    const client = (await a.agent.post("/clients").send({ name: "Nguyen family" }).expect(201))
      .body;
    const source = (await a.agent.post("/notes").send({ templateId: "lender-update" }).expect(201))
      .body.id;

    const tpl = await a.agent
      .post("/templates")
      .send({ noteId: source, name: "ANZ conditions call", description: "Our ANZ checklist" })
      .expect(201);
    expect(tpl.body).toMatchObject({
      name: "ANZ conditions call",
      noteType: "CONDITIONS",
      createdBy: { id: a.id },
      canRemove: true,
    });

    // Everyone can use it (case managers included) — but not create one.
    expect((await cm.agent.get("/templates").expect(200)).body).toHaveLength(1);
    await cm.agent.post("/templates").send({ noteId: source, name: "Nope" }).expect(403);
    const made = await cm.agent
      .post("/notes")
      .send({ templateId: tpl.body.id, clientId: client.id })
      .expect(201);
    const note = (await cm.agent.get(`/notes/${made.body.id}`).expect(200)).body;
    expect(note.title).toBe("ANZ conditions call – Nguyen family");
    expect(note.noteType).toBe("CONDITIONS");
    expect(JSON.stringify(note.contentJson)).toContain("Update received");

    // Only its creator or an admin removes it; removed templates can't be used.
    expect((await cm.agent.get("/templates")).body[0].canRemove).toBe(false);
    await cm.agent.delete(`/templates/${tpl.body.id}`).expect(403);
    await a.agent.delete(`/templates/${tpl.body.id}`).expect(204);
    expect((await a.agent.get("/templates")).body).toEqual([]);
    await a.agent.post("/notes").send({ templateId: tpl.body.id }).expect(404);

    const log = await a.agent.get("/audit?category=team").expect(200);
    expect(log.body.items.slice(0, 2).map((e: { action: string }) => e.action)).toEqual([
      "template.removed",
      "template.created",
    ]);
  });

  it("keeps templates inside the brokerage", async () => {
    const a = await admin();
    const b = await admin();
    const source = (await a.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body.id;
    const tpl = (
      await a.agent.post("/templates").send({ noteId: source, name: "Private" }).expect(201)
    ).body;
    expect((await b.agent.get("/templates")).body).toEqual([]);
    await b.agent.post("/notes").send({ templateId: tpl.id }).expect(404);
    await b.agent.delete(`/templates/${tpl.id}`).expect(404);
    await b.agent.post("/templates").send({ noteId: source, name: "Steal" }).expect(404);
  });
});
