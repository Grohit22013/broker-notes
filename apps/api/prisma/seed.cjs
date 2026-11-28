/**
 * Demo data for BrokerNotes: one broker account with realistic Australian clients and file notes.
 * Idempotent — re-running replaces the demo account (and only that account).
 *
 *   npm run db:seed                     (from the repo root)
 *   SEED_EMAIL / SEED_PASSWORD env vars override the defaults below.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { noteFromTemplate } = require("@broker-notes/shared/notes/templates");
const { zonedMidnight, zonedYmd } = require("@broker-notes/shared/dates");

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
  await db.user.deleteMany({ where: { email: EMAIL } });
  const user = await db.user.create({
    data: { name: "Demo Broker", email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 12) },
  });

  const client = (name, email, phone) =>
    db.client.create({ data: { userId: user.id, name, email, phone } });
  const nguyen = await client("Nguyen family", "nguyen@example.com", "0400 123 456");
  const patel = await client("Asha & Raj Patel", "patel@example.com", "0411 222 333");
  const smith = await client("Chloe Smith", "chloe.smith@example.com", "0422 333 444");
  const obrien = await client("Liam O’Brien", "liam@example.com", null);

  /** @type {Array<{client: any, template?: string, title?: string, type?: string, stage: string|null, tags: string[], pinned?: boolean, followUp?: Date, kf?: object, body: object, hours: number, finalise?: string[]}>} */
  const notes = [
    {
      client: nguyen,
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

  for (const n of notes) {
    const tpl = noteFromTemplate(n.template, n.client.name);
    const created = await db.note.create({
      data: {
        userId: user.id,
        clientId: n.client.id,
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
    });
    for (const body of n.finalise ?? []) {
      await db.noteAmendment.create({ data: { noteId: created.id, body } });
    }
  }

  console.log(`Seeded ${EMAIL} (password: ${PASSWORD}) — 4 clients, ${notes.length} notes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
