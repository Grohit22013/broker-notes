import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp, loadDotEnv } from "../src/main";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Phase 8: organisations, roles, invites and the audit log — over HTTP against a real Postgres.
 * Test brokerages use @orgs.brokernotes.test members and are removed afterwards.
 */
const DOMAIN = "orgs.brokernotes.test";
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
  // Deleting the brokerage cascades to its members, clients, notes, invites and audit log.
  await db.organisation.deleteMany({
    where: { members: { some: { email: { endsWith: `@${DOMAIN}` } } } },
  });
  await app.close();
});

type Member = { agent: ReturnType<typeof request.agent>; id: string; email: string };

/** A new brokerage with its admin signed in. */
async function admin(organisationName = "Harbour Home Loans"): Promise<Member> {
  const agent = request.agent(app.getHttpServer());
  const addr = email("admin");
  const res = await agent
    .post("/auth/register")
    .send({
      name: "Alex Admin",
      email: addr,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      organisationName,
    })
    .expect(201);
  return { agent, id: res.body.id, email: addr };
}

/** Invites someone with `role` into the admin's brokerage and registers them. */
async function join(
  by: Member,
  role: "ADMIN" | "ADVISER" | "CASE_MANAGER",
  name = "Pat",
): Promise<Member> {
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
  return { agent, id: res.body.id, email: addr };
}

const newNote = async (m: Member) =>
  (await m.agent.post("/notes").send({ templateId: "blank" }).expect(201)).body.id as string;

const save = (m: Member, id: string, text = "Updated") =>
  m.agent.put(`/notes/${id}/content`).send({
    title: text,
    contentJson: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
    contentText: text,
  });

describe("registration & organisations", () => {
  it("creates a brokerage with the registrant as admin", async () => {
    const a = await admin("Coastal Lending Co");
    const me = await a.agent.get("/auth/me").expect(200);
    expect(me.body).toMatchObject({ role: "ADMIN", organisationName: "Coastal Lending Co" });
    const org = await a.agent.get("/organisation").expect(200);
    expect(org.body.members).toHaveLength(1);
    expect(org.body.members[0]).toMatchObject({ id: a.id, role: "ADMIN", active: true });
  });

  it("defaults the brokerage name from the person's name", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/auth/register")
      .send({ name: "Jo Lee", email: email("jo"), password: PASSWORD, confirmPassword: PASSWORD })
      .expect(201);
    expect((await agent.get("/auth/me")).body.organisationName).toBe("Jo Lee's brokerage");
  });
});

describe("invites", () => {
  it("joins the inviting brokerage with the invited role, and the link is single-use", async () => {
    const a = await admin();
    const addr = email("adv");
    const invite = await a.agent
      .post("/organisation/invites")
      .send({ email: addr, role: "ADVISER" })
      .expect(201);
    expect(invite.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Public preview for the register page.
    const preview = await request(app.getHttpServer())
      .get(`/invites/${invite.body.token}`)
      .expect(200);
    expect(preview.body).toEqual({
      organisationName: "Harbour Home Loans",
      email: addr,
      role: "ADVISER",
      invitedBy: "Alex Admin",
    });

    const body = {
      name: "Priya",
      email: addr,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      inviteToken: invite.body.token,
    };
    const agent = request.agent(app.getHttpServer());
    await agent.post("/auth/register").send(body).expect(201);
    expect((await agent.get("/auth/me")).body).toMatchObject({
      role: "ADVISER",
      organisationName: "Harbour Home Loans",
    });

    // Used: preview 404s and a second registration is refused.
    await request(app.getHttpServer()).get(`/invites/${invite.body.token}`).expect(404);
    const again = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...body, email: email("other") })
      .expect(400);
    expect(again.body.message).toMatch(/invalid or has expired/);
  });

  it("binds the invite to its email and stores only a hash of the token", async () => {
    const a = await admin();
    const addr = email("bound");
    const invite = await a.agent
      .post("/organisation/invites")
      .send({ email: addr, role: "CASE_MANAGER" })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        name: "Sam",
        email: email("wrong"),
        password: PASSWORD,
        confirmPassword: PASSWORD,
        inviteToken: invite.body.token,
      })
      .expect(400);
    expect(res.body).toMatchObject({ field: "email" });
    expect(res.body.message).toContain(addr);

    const stored = await db.invite.findUniqueOrThrow({ where: { id: invite.body.id } });
    expect(stored.tokenHash).not.toBe(invite.body.token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects expired and revoked invites", async () => {
    const a = await admin();
    const expired = await a.agent
      .post("/organisation/invites")
      .send({ email: email("exp"), role: "ADVISER" })
      .expect(201);
    await db.invite.update({
      where: { id: expired.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer()).get(`/invites/${expired.body.token}`).expect(404);

    const revoked = await a.agent
      .post("/organisation/invites")
      .send({ email: email("rev"), role: "ADVISER" })
      .expect(201);
    await a.agent.delete(`/organisation/invites/${revoked.body.id}`).expect(204);
    await request(app.getHttpServer()).get(`/invites/${revoked.body.token}`).expect(404);
  });

  it("refuses to invite someone who already has an account", async () => {
    const a = await admin();
    const res = await a.agent
      .post("/organisation/invites")
      .send({ email: a.email, role: "ADVISER" })
      .expect(409);
    expect(res.body.message).toMatch(/already a member/);
  });

  it("is admin-only", async () => {
    const a = await admin();
    const adviser = await join(a, "ADVISER");
    const res = await adviser.agent
      .post("/organisation/invites")
      .send({ email: email("x"), role: "ADVISER" })
      .expect(403);
    expect(res.body.message).toMatch(/Only brokerage admins/);
    // Non-admins can see their colleagues but not pending invites.
    await a.agent
      .post("/organisation/invites")
      .send({ email: email("pending"), role: "ADVISER" })
      .expect(201);
    const org = await adviser.agent.get("/organisation").expect(200);
    expect(org.body.members).toHaveLength(2);
    expect(org.body.invites).toEqual([]);
    expect((await a.agent.get("/organisation")).body.invites).toHaveLength(1);
  });
});

describe("roles", () => {
  it("lets every member read the brokerage's notes, but only the author or an admin change them", async () => {
    const a = await admin();
    const adviser = await join(a, "ADVISER", "Priya");
    const cm = await join(a, "CASE_MANAGER", "Sam");

    const priyasNote = await newNote(adviser);
    await save(adviser, priyasNote, "Priya's note").expect(200);

    // Visible to everyone in the brokerage, with the author shown.
    const listed = await cm.agent.get("/notes").expect(200);
    expect(listed.body.items.find((n: { id: string }) => n.id === priyasNote).author).toEqual({
      id: adviser.id,
      name: "Priya",
    });
    await cm.agent.get(`/notes/${priyasNote}`).expect(200);

    // A case manager (not the author) can't change it…
    const denied = await save(cm, priyasNote).expect(403);
    expect(denied.body.message).toMatch(/author or a brokerage admin/);
    await cm.agent.patch(`/notes/${priyasNote}/meta`).send({ pinned: true }).expect(403);
    await cm.agent.post(`/notes/${priyasNote}/finalise`).expect(403);
    await cm.agent.delete(`/notes/${priyasNote}`).expect(403);

    // …but can write their own notes (e.g. lender updates).
    const samsNote = await newNote(cm);
    await save(cm, samsNote, "Lender update").expect(200);
    await adviser.agent.delete(`/notes/${samsNote}`).expect(403);

    // The admin can change anyone's note.
    await save(a, priyasNote, "Admin correction").expect(200);
    await a.agent.post(`/notes/${priyasNote}/finalise`).expect(204);
  });

  it("filters to my notes with mine=1", async () => {
    const a = await admin();
    const adviser = await join(a, "ADVISER");
    const mine = await newNote(adviser);
    const theirs = await newNote(a);
    const ids = (await adviser.agent.get("/notes?mine=1").expect(200)).body.items.map(
      (n: { id: string }) => n.id,
    );
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  it("keeps client management and export from case managers", async () => {
    const a = await admin();
    const cm = await join(a, "CASE_MANAGER");
    const client = await a.agent.post("/clients").send({ name: "Nguyen family" }).expect(201);
    await cm.agent.get("/clients").expect(200);
    await cm.agent.get(`/clients/${client.body.id}`).expect(200);
    const res = await cm.agent.post("/clients").send({ name: "Nope" }).expect(403);
    expect(res.body.message).toMatch(/Case managers can view clients/);
    await cm.agent.patch(`/clients/${client.body.id}`).send({ name: "Renamed" }).expect(403);
    await cm.agent.get("/export/notes").expect(403);
    await cm.agent.get("/export/clients").expect(403);
    // Case managers can still link their notes to the brokerage's clients.
    await cm.agent
      .post("/notes")
      .send({ templateId: "blank", clientId: client.body.id })
      .expect(201);
  });

  it("assigns clients only to advisers in the same brokerage", async () => {
    const a = await admin();
    const adviser = await join(a, "ADVISER", "Priya");
    const other = await admin("Other Brokerage");
    const ok = await a.agent
      .post("/clients")
      .send({ name: "Chloe Smith", assignedAdviserId: adviser.id })
      .expect(201);
    expect(ok.body.assignedAdviser).toEqual({ id: adviser.id, name: "Priya" });
    await a.agent.post("/clients").send({ name: "Liam", assignedAdviserId: other.id }).expect(404);
  });

  it("applies role changes and deactivation immediately", async () => {
    const a = await admin();
    const adviser = await join(a, "ADVISER");
    await adviser.agent.post("/clients").send({ name: "Before" }).expect(201);

    await a.agent
      .patch(`/organisation/members/${adviser.id}`)
      .send({ role: "CASE_MANAGER" })
      .expect(200);
    // Same session cookie, new rights — and a refreshed cookie so the UI catches up.
    const res = await adviser.agent.post("/clients").send({ name: "After" }).expect(403);
    expect(String(res.headers["set-cookie"] ?? "")).toMatch(/bn_session=/);

    await a.agent.patch(`/organisation/members/${adviser.id}`).send({ active: false }).expect(200);
    const gone = await adviser.agent.get("/notes").expect(401);
    expect(gone.body.message).toMatch(/deactivated/);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: adviser.email, password: PASSWORD })
      .expect(401);
    expect(login.body.message).toMatch(/deactivated/);

    await a.agent.patch(`/organisation/members/${adviser.id}`).send({ active: true }).expect(200);
    await adviser.agent.get("/notes").expect(200);
  });

  it("always keeps an active admin", async () => {
    const a = await admin();
    const res = await a.agent
      .patch(`/organisation/members/${a.id}`)
      .send({ role: "ADVISER" })
      .expect(409);
    expect(res.body.message).toMatch(/at least one active admin/);
    await a.agent.patch(`/organisation/members/${a.id}`).send({ active: false }).expect(400);
    const second = await join(a, "ADMIN");
    await a.agent.patch(`/organisation/members/${a.id}`).send({ role: "ADVISER" }).expect(200);
    await second.agent.get("/audit").expect(200);
  });
});

describe("organisation isolation", () => {
  it("never exposes another brokerage's notes, clients, members or invites", async () => {
    const a = await admin();
    const b = await admin("Rival Brokerage");
    const note = await newNote(a);
    const client = await a.agent.post("/clients").send({ name: "Private client" }).expect(201);
    const invite = await a.agent
      .post("/organisation/invites")
      .send({ email: email("iso"), role: "ADVISER" })
      .expect(201);

    await b.agent.get(`/notes/${note}`).expect(404);
    await save(b, note).expect(404);
    await b.agent.get(`/clients/${client.body.id}`).expect(404);
    await b.agent
      .post("/notes")
      .send({ templateId: "blank", clientId: client.body.id })
      .expect(404);
    await b.agent.patch(`/organisation/members/${a.id}`).send({ role: "ADVISER" }).expect(404);
    await b.agent.delete(`/organisation/invites/${invite.body.id}`).expect(404);
    expect((await b.agent.get("/notes")).body.items).toEqual([]);
    expect(
      (await b.agent.get("/organisation")).body.members.map((m: { id: string }) => m.id),
    ).toEqual([b.id]);
    expect(
      (await b.agent.get("/audit")).body.items.every(
        (e: { user: { id: string } | null }) => e.user?.id === b.id,
      ),
    ).toBe(true);
  });
});

describe("audit log", () => {
  it("records important actions, newest first, and filters by category", async () => {
    const a = await admin();
    const adviser = await join(a, "ADVISER", "Priya");
    const note = await newNote(adviser);
    await save(adviser, note, "Fact find").expect(200);
    await adviser.agent.post(`/notes/${note}/finalise`).expect(204);
    await adviser.agent
      .post(`/notes/${note}/amendments`)
      .send({ body: "Client confirmed gift letter." })
      .expect(201);

    const log = await a.agent.get("/audit").expect(200);
    const actions = log.body.items.map((e: { action: string }) => e.action);
    expect(actions.slice(0, 5)).toEqual([
      "note.amended",
      "note.finalised",
      "note.created",
      "member.joined",
      "member.invited",
    ]);
    expect(log.body.items[0]).toMatchObject({
      summary: "Added an amendment to “Fact find”",
      entityType: "note",
      entityId: note,
      user: { id: adviser.id, name: "Priya" },
    });
    // Content autosaves are deliberately not logged (versions cover them).
    expect(actions).not.toContain("note.content_saved");

    const team = await a.agent.get("/audit?category=team").expect(200);
    expect(
      team.body.items.every((e: { action: string }) =>
        /^(member|invite|organisation)\./.test(e.action),
      ),
    ).toBe(true);
    await adviser.agent.get("/audit").expect(403);
  });

  it("paginates with a cursor", async () => {
    const a = await admin();
    for (let i = 0; i < 52; i++) {
      await db.auditLog.create({
        data: {
          organisationId: (await db.user.findUniqueOrThrow({ where: { id: a.id } })).organisationId,
          userId: a.id,
          action: "note.created",
          summary: `Seeded ${i}`,
        },
      });
    }
    const first = await a.agent.get("/audit").expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.nextCursor).toBe(first.body.items[49].id);
    const second = await a.agent.get(`/audit?cursor=${first.body.nextCursor}`).expect(200);
    const ids = new Set(
      [...first.body.items, ...second.body.items].map((e: { id: string }) => e.id),
    );
    expect(ids.size).toBe(first.body.items.length + second.body.items.length);
    expect(second.body.nextCursor).toBeNull();
  });
});
