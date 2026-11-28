/**
 * Demo data for BrokerNotes: a brokerage ("Harbour Home Loans") with an admin, an adviser and a
 * case manager, realistic Australian clients, file notes and an audit trail.
 * Idempotent — re-running replaces the demo brokerage (and only that brokerage).
 *
 *   npm run db:seed                     (from the repo root)
 *   SEED_EMAIL / SEED_PASSWORD env vars override the admin's defaults below. The adviser and case
 *   manager sign in with the same password: adviser@brokernotes.dev, casemanager@brokernotes.dev.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { noteFromTemplate } = require("@broker-notes/shared/notes/templates");
const { zonedMidnight, zonedYmd } = require("@broker-notes/shared/dates");
const { formatCaseReference, caseStage } = require("@broker-notes/shared/cases/taxonomy");

const EMAIL = (process.env.SEED_EMAIL || "demo@brokernotes.dev").toLowerCase();
const PASSWORD = process.env.SEED_PASSWORD || "demo1234";
const db = new PrismaClient();

// ── Tiptap JSON helpers ──────────────────────────────────────────────────────
const t = (text, marks) => ({ type: "text", text, ...(marks ? { marks } : {}) });
const bold = (text) => t(text, [{ type: "bold" }]);
const p = (...parts) => ({
  type: "paragraph",
  content: parts.map((x) => (typeof x === "string" ? t(x) : x)),
});
const h2 = (text) => ({ type: "heading", attrs: { level: 2 }, content: [t(text)] });
const bullets = (items) => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [p(i)] })),
});
const tasks = (items) => ({
  type: "taskList",
  content: items.map(([text, checked]) => ({
    type: "taskItem",
    attrs: { checked },
    content: [p(text)],
  })),
});
const doc = (...content) => ({ type: "doc", content });

/** Plain-text projection, matching what the editor stores (block per line). */
function plain(node) {
  if (node.type === "text") return node.text;
  const inner = (node.content || []).map(plain);
  return ["paragraph", "heading"].includes(node.type) ? inner.join("") : inner.join("\n");
}

const today = zonedYmd(new Date());
const day = (offset) => zonedMidnight({ ...today, day: today.day + offset });
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000);

async function main() {
  const ADVISER_EMAIL = "adviser@brokernotes.dev";
  const CM_EMAIL = "casemanager@brokernotes.dev";
  // Deleting the brokerage cascades to its members, clients, notes and audit log.
  await db.organisation.deleteMany({
    where: { members: { some: { email: { in: [EMAIL, ADVISER_EMAIL, CM_EMAIL] } } } },
  });
  const org = await db.organisation.create({ data: { name: "Harbour Home Loans" } });
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const member = (name, email, role, joinedHoursAgo) =>
    db.user.create({
      data: {
        name,
        email,
        role,
        passwordHash,
        organisationId: org.id,
        createdAt: hoursAgo(joinedHoursAgo),
      },
    });
  const user = await member("Demo Broker", EMAIL, "ADMIN", 400);
  const adviser = await member("Priya Sharma", ADVISER_EMAIL, "ADVISER", 300);
  const caseManager = await member("Sam Lee", CM_EMAIL, "CASE_MANAGER", 250);

  const audit = (actor, action, summary, hours, extra = {}) =>
    db.auditLog.create({
      data: {
        organisationId: org.id,
        userId: actor.id,
        action,
        summary,
        createdAt: hoursAgo(hours),
        ...extra,
      },
    });
  await audit(user, "organisation.created", "Created the brokerage “Harbour Home Loans”", 400);
  await audit(user, "member.invited", `Invited ${ADVISER_EMAIL} as Adviser`, 301);
  await audit(adviser, "member.joined", "Joined as Adviser", 300);
  await audit(user, "member.invited", `Invited ${CM_EMAIL} as Case manager`, 251);
  await audit(caseManager, "member.joined", "Joined as Case manager", 250);

  const client = (name, email, phone, adviserId) =>
    db.client.create({
      data: {
        organisationId: org.id,
        userId: user.id,
        assignedAdviserId: adviserId ?? null,
        name,
        email,
        phone,
      },
    });
  const nguyen = await client("Nguyen family", "nguyen@example.com", "0400 123 456", adviser.id);
  const patel = await client("Asha & Raj Patel", "patel@example.com", "0411 222 333", adviser.id);
  const smith = await client("Chloe Smith", "chloe.smith@example.com", "0422 333 444", user.id);
  const obrien = await client("Liam O’Brien", "liam@example.com", null, user.id);

  // Mortgage cases: one per deal, at different points in the pipeline.
  let caseSeq = 0;
  const mortgageCase = async (forClient, type, stage, extra, adviserId, openedHoursAgo) => {
    const reference = formatCaseReference(today.year, ++caseSeq);
    const c = await db.mortgageCase.create({
      data: {
        organisationId: org.id,
        clientId: forClient.id,
        reference,
        type,
        stage,
        assignedAdviserId: adviserId,
        createdById: user.id,
        createdAt: hoursAgo(openedHoursAgo),
        stageChangedAt: hoursAgo(Math.max(1, openedHoursAgo - 24)),
        updatedAt: hoursAgo(Math.max(1, openedHoursAgo - 24)),
        ...extra,
      },
    });
    const ref = { entityType: "case", entityId: c.id };
    await audit(
      user,
      "case.created",
      `Opened case ${reference} for ${forClient.name}`,
      openedHoursAgo,
      ref,
    );
    if (stage !== "ENQUIRY") {
      await audit(
        user,
        "case.stage_changed",
        `Moved ${reference} from Enquiry to ${caseStage(stage).label}`,
        Math.max(1, openedHoursAgo - 24),
        ref,
      );
    }
    return c;
  };
  const nguyenPurchase = await mortgageCase(
    nguyen,
    "FIRST_HOME",
    "FACT_FIND",
    { loanAmount: 680000, propertyValue: 850000 },
    adviser.id,
    30,
  );
  const patelInvestment = await mortgageCase(
    patel,
    "INVESTMENT",
    "ASSESSMENT",
    { loanAmount: 920000, propertyValue: 1150000, lender: "ANZ", lenderReference: "ANZ-7781203" },
    adviser.id,
    260,
  );
  const smithPurchase = await mortgageCase(
    smith,
    "PURCHASE",
    "LODGED",
    { loanAmount: 540000, propertyValue: 640000, lender: "NAB", lenderReference: "NAB-55102" },
    user.id,
    220,
  );
  const obrienPurchase = await mortgageCase(
    obrien,
    "FIRST_HOME",
    "SETTLED",
    { loanAmount: 495000, propertyValue: 610000, lender: "Macquarie" },
    user.id,
    380,
  );
  const nguyenRefi = await mortgageCase(
    nguyen,
    "REFINANCE",
    "RESEARCH",
    { loanAmount: 412000, lender: "Westpac" },
    adviser.id,
    125,
  );

  /** @type {Array<{client: any, case?: any, author?: any, template?: string, title?: string, type?: string, stage: string|null, tags: string[], pinned?: boolean, followUp?: Date, kf?: object, body: object, hours: number, finalise?: string[]}>} */
  const notes = [
    {
      client: nguyen,
      case: nguyenPurchase,
      author: adviser,
      template: "discovery",
      stage: "LEAD",
      tags: ["first-home", "fhog"],
      pinned: true,
      followUp: day(0),
      hours: 2,
      kf: { loanAmount: 680000, propertyValue: 850000, income: 182000 },
      body: doc(
        h2("Goals & timeline"),
        p(
          "First home buyers looking in ",
          bold("Parramatta"),
          "; want to settle before March 2027.",
        ),
        h2("Income & deposit"),
        bullets([
          "Combined income $182,000 p.a. (both PAYG)",
          "Deposit $170,000 saved + FHOG eligible",
        ]),
        h2("Next steps"),
        tasks([
          ["Send fact find", true],
          ["Request 3 months of payslips", false],
          ["Order pre-approval valuation", false],
        ]),
      ),
    },
    {
      client: patel,
      case: patelInvestment,
      author: caseManager,
      template: "conditions",
      stage: "CONDITIONAL",
      tags: ["anz", "investor"],
      followUp: day(-2),
      hours: 5,
      kf: { loanAmount: 920000, propertyValue: 1150000, rate: 6.04, lender: "ANZ" },
      body: doc(
        h2("Lender & approval"),
        p("ANZ conditional approval received 25 Nov."),
        h2("Outstanding conditions"),
        tasks([
          ["Valuation", true],
          ["Rental ledger for investment property", false],
          ["Signed contract of sale", false],
        ]),
      ),
    },
    {
      client: smith,
      case: smithPurchase,
      template: "lender-rationale",
      stage: "APPLICATION",
      tags: ["best-interests"],
      followUp: day(4),
      hours: 26,
      kf: { loanAmount: 540000, propertyValue: 640000, rate: 5.99, lender: "NAB" },
      body: doc(
        h2("Client requirements & objectives"),
        p(
          "Owner-occupier, wants an offset account and the flexibility to make extra repayments; 30-year term.",
        ),
        h2("Lenders & products considered"),
        bullets([
          "NAB Base Variable 5.99% — full offset, no annual fee",
          "CBA Wealth Package 5.89% — $395 annual fee",
          "Westpac Flexi First 6.09% — redraw only",
        ]),
        h2("Why it is in the client's best interests"),
        p(
          "NAB has the lowest total cost over 5 years once the CBA package fee is included, and the only full offset without a fee.",
        ),
        h2("Why other options were not recommended"),
        p(
          "CBA's lower rate is outweighed by the $395 fee at this loan size; Westpac lacks the offset the client asked for.",
        ),
      ),
      finalise: [
        "Client confirmed on 2 Dec that $20k of the deposit is a gift from parents; gift letter on file.",
      ],
    },
    {
      client: obrien,
      case: obrienPurchase,
      template: "settlement",
      stage: "SETTLED",
      tags: ["first-home"],
      hours: 72,
      kf: { loanAmount: 495000, propertyValue: 610000, rate: 6.14, lender: "Macquarie" },
      body: doc(
        h2("Settlement details"),
        bullets([
          "Settled 14 Nov",
          "Macquarie Basic Variable 6.14%",
          "LVR 81.1% — LMI capitalised",
        ]),
        h2("Post-settlement"),
        tasks([
          ["Send welcome email", true],
          ["Set annual review reminder", true],
        ]),
      ),
      finalise: [],
    },
    {
      client: nguyen,
      case: nguyenRefi,
      author: adviser,
      template: "review",
      stage: "REVIEW",
      tags: ["refinance"],
      followUp: day(10),
      hours: 120,
      body: doc(
        h2("Current loan"),
        bullets(["Westpac variable 6.49%", "Balance $412,000"]),
        h2("Market comparison"),
        p(
          "Comparing CBA offset package and Macquarie basic variable — potential saving ~$2,100 p.a.",
        ),
      ),
    },
    {
      client: smith,
      case: smithPurchase,
      template: "fact-find",
      stage: "PRE_APPROVAL",
      tags: ["self-employed"],
      hours: 200,
      kf: { income: 145000 },
      body: doc(
        h2("Employment & income"),
        p("Sole trader (graphic design) for 4 years; 2 years of tax returns and BAS provided."),
        h2("Liabilities & expenses"),
        bullets([
          "Car loan $14,000 remaining",
          "Credit card limit $8,000 (to be reduced to $3,000)",
        ]),
      ),
    },
  ];

  /** Created notes by template id (for linking tasks). */
  const noteByTemplate = {};
  for (const n of notes) {
    const tpl = noteFromTemplate(n.template, n.client.name);
    const author = n.author ?? user;
    const created = (noteByTemplate[n.template] = await db.note.create({
      data: {
        organisationId: org.id,
        userId: author.id,
        clientId: n.client.id,
        caseId: n.case?.id ?? null,
        title: tpl.title,
        noteType: tpl.noteType,
        contentJson: n.body,
        contentText: plain(n.body),
        loanStage: n.stage,
        tags: n.tags,
        pinned: Boolean(n.pinned),
        followUpAt: n.followUp ?? null,
        keyFigures: n.kf ?? undefined,
        createdAt: hoursAgo(n.hours + 1),
        updatedAt: hoursAgo(n.hours),
        versions: {
          create: { title: tpl.title, contentJson: n.body, createdAt: hoursAgo(n.hours + 1) },
        },
        ...(n.finalise ? { status: "FINALISED", finalisedAt: hoursAgo(n.hours) } : {}),
      },
    }));
    const ref = { entityType: "note", entityId: created.id };
    await audit(author, "note.created", `Created “${tpl.title}”`, n.hours + 1, ref);
    if (n.finalise) await audit(author, "note.finalised", `Finalised “${tpl.title}”`, n.hours, ref);
    for (const body of n.finalise ?? []) {
      await db.noteAmendment.create({ data: { noteId: created.id, body } });
      await audit(author, "note.amended", `Added an amendment to “${tpl.title}”`, n.hours, ref);
    }
  }
  // Follow-up tasks: some due, one overdue, one done, one unassigned.
  const task = async (title, from, extra) => {
    const t = await db.task.create({
      data: {
        organisationId: org.id,
        title,
        noteId: from.note?.id ?? null,
        clientId: from.client.id,
        caseId: from.case?.id ?? null,
        createdById: from.by.id,
        createdAt: hoursAgo(from.hours),
        ...extra,
      },
    });
    await audit(from.by, "task.created", `Created task “${title}”`, from.hours, {
      entityType: "task",
      entityId: t.id,
    });
    return t;
  };
  await task(
    "Request 3 months of payslips",
    { note: noteByTemplate.discovery, client: nguyen, case: nguyenPurchase, by: adviser, hours: 2 },
    { assigneeId: adviser.id, priority: "HIGH", dueAt: day(0) },
  );
  await task(
    "Chase rental ledger for the investment property",
    {
      note: noteByTemplate.conditions,
      client: patel,
      case: patelInvestment,
      by: caseManager,
      hours: 5,
    },
    { assigneeId: caseManager.id, priority: "HIGH", dueAt: day(-2), status: "IN_PROGRESS" },
  );
  await task(
    "Send signed contract of sale to ANZ",
    {
      note: noteByTemplate.conditions,
      client: patel,
      case: patelInvestment,
      by: caseManager,
      hours: 5,
    },
    { assigneeId: caseManager.id, dueAt: day(1) },
  );
  await task(
    "Confirm gift letter is on file",
    {
      note: noteByTemplate["lender-rationale"],
      client: smith,
      case: smithPurchase,
      by: user,
      hours: 26,
    },
    { assigneeId: user.id, dueAt: day(3) },
  );
  await task(
    "Book annual review",
    { note: noteByTemplate.settlement, client: obrien, case: obrienPurchase, by: user, hours: 72 },
    { priority: "LOW", dueAt: day(300) },
  );
  await task(
    "Send fact find",
    { note: noteByTemplate.discovery, client: nguyen, case: nguyenPurchase, by: adviser, hours: 2 },
    {
      assigneeId: adviser.id,
      status: "COMPLETED",
      completedAt: hoursAgo(1),
      completedById: adviser.id,
    },
  );

  await audit(user, "export.clients", "Exported 4 clients to CSV", 20, {
    entityType: "export",
    metadata: { count: 4 },
  });
  await audit(adviser, "auth.signed_in", "Signed in", 3);
  await audit(user, "auth.signed_in", "Signed in", 1);

  // Never print the password itself (it may be a real secret from SEED_PASSWORD).
  const source = process.env.SEED_PASSWORD ? "SEED_PASSWORD" : "the documented demo default";
  console.log(
    `Seeded “Harbour Home Loans”: ${EMAIL} (admin), ${ADVISER_EMAIL}, ${CM_EMAIL} ` +
      `(password from ${source}) — 4 clients, ${caseSeq} cases, ${notes.length} notes, 6 tasks.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
