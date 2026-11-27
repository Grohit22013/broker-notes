/**
 * Captures UI screenshots (mobile + desktop) for PRs and the README.
 * Usage: build + start the app on :3100, then `npx tsx scripts/screenshots.ts <outDir>`.
 * Creates a throwaway demo account (removed at the end).
 */
import { chromium, devices, type Page } from "@playwright/test";
import { PrismaClient, type LoanStage, type NoteType } from "@prisma/client";

import { zonedMidnight, zonedYmd } from "@broker-notes/shared/dates";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.argv[2] ?? "docs/screenshots";
const EMAIL = `demo-${Date.now()}@screens.brokernotes.test`;

async function fillDemoNote(page: Page) {
  await page.getByLabel("Note title").fill("Discovery call – Nguyen family");
  await page.getByRole("textbox", { name: "Note body" }).click();
  const k = page.keyboard;
  await k.type("## Goals & timeline");
  await k.press("Enter");
  await k.type("First home buyers, looking in Parramatta. Want to settle before ");
  await k.press("ControlOrMeta+b");
  await k.type("March 2027");
  await k.press("ControlOrMeta+b");
  await k.type(".");
  await k.press("Enter");
  await k.type("## Finances");
  await k.press("Enter");
  await k.type("- Combined income $182,000 p.a.");
  await k.press("Enter");
  await k.type("Deposit $95,000 + FHOG eligible");
  await k.press("Enter");
  await k.press("Enter");
  await k.type("## Next steps");
  await k.press("Enter");
  await k.type("[ ] Request 3 months of payslips");
  await k.press("Enter");
  await k.type("Send fact find form");
  await page
    .getByRole("status")
    .locator("visible=true")
    .first()
    .getByText(/^Saved$/)
    .waitFor({ timeout: 20_000 });
}

/** Realistic demo notes with details, so list/filter screenshots look like a real pipeline. */
async function seedDemoNotes(email: string) {
  const db = new PrismaClient();
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const today = zonedYmd(new Date());
  const day = (offset: number) => zonedMidnight({ ...today, day: today.day + offset });
  const notes: {
    title: string;
    text: string;
    type: NoteType;
    stage: LoanStage | null;
    tags: string[];
    followUp?: Date;
    pinned?: boolean;
  }[] = [
    {
      title: "Patel – conditions tracker",
      text: "Valuation ordered with ANZ. Outstanding: payslips, rental ledger, signed contract of sale.",
      type: "CONDITIONS",
      stage: "CONDITIONAL",
      tags: ["anz", "investor"],
      followUp: day(0),
      pinned: true,
    },
    {
      title: "Smith – refinance review",
      text: "Current Westpac rate 6.49%. Comparing CBA offset package and Macquarie basic variable.",
      type: "REVIEW",
      stage: "REVIEW",
      tags: ["refinance"],
      followUp: day(-2),
    },
    {
      title: "Chen – lender rationale",
      text: "Recommended NAB: lowest comparison rate for 85% LVR without LMI waiver alternatives.",
      type: "LENDER_RATIONALE",
      stage: "APPLICATION",
      tags: ["best-interests"],
      followUp: day(5),
    },
    {
      title: "O’Brien – settlement",
      text: "Settled 14 Nov. Client briefed on repayments and offset account. Annual review booked.",
      type: "SETTLEMENT",
      stage: "SETTLED",
      tags: ["first-home"],
    },
    {
      title: "Kaur – fact find",
      text: "Two applicants, PAYG and sole trader. HECS debts, one car loan. Target purchase $1.1m.",
      type: "FACT_FIND",
      stage: "PRE_APPROVAL",
      tags: ["self-employed"],
    },
  ];
  for (const [i, n] of notes.entries()) {
    await db.note.create({
      data: {
        userId: user.id,
        title: n.title,
        contentText: n.text,
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: n.text }] }],
        },
        noteType: n.type,
        loanStage: n.stage,
        tags: n.tags,
        followUpAt: n.followUp ?? null,
        pinned: n.pinned ?? false,
        updatedAt: new Date(Date.now() - (i + 1) * 3_600_000),
      },
    });
  }
  await db.$disconnect();
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`);
  await page.screenshot({ path: `${OUT}/login-desktop.png` });

  await page.goto(`${BASE}/register`);
  await page.getByLabel("Full name").fill("Asha Broker");
  await page.getByLabel("Work email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("secure123");
  await page.getByLabel("Confirm password").fill("secure123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/notes$/);
  await page.screenshot({ path: `${OUT}/notes-empty-desktop.png` });

  // Phase 4: client + template picker
  await page.goto(`${BASE}/clients`);
  await page.getByRole("button", { name: "New client" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill("Nguyen family");
  await page.getByRole("dialog").getByLabel("Email").fill("nguyen@example.com");
  await page.getByRole("dialog").getByLabel("Phone").fill("0400 123 456");
  await page.getByRole("dialog").getByRole("button", { name: "Add client" }).click();
  await page.waitForURL(/\/clients\/.+/);
  await page.getByRole("link", { name: "New note", exact: true }).click();
  await page.waitForURL(/\/notes\/new/);
  await page
    .getByRole("button", { name: /^Create note from template/ })
    .first()
    .waitFor();
  await page.screenshot({ path: `${OUT}/templates-desktop.png` });
  await page.getByRole("button", { name: "Create note from template: Blank note" }).click();
  await page.waitForURL(/\/notes\/[a-z0-9]{20,}$/);
  await fillDemoNote(page);
  await page.screenshot({ path: `${OUT}/editor-desktop.png` });
  const noteUrl = page.url();

  // Phase 3: details panel on the demo note
  await page.getByRole("button", { name: /^Details/ }).click();
  await page.getByRole("dialog").getByLabel("Note type").click();
  await page.getByRole("option", { name: "Discovery call", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Loan stage").click();
  await page.getByRole("option", { name: "Lead", exact: true }).click();
  await page.getByRole("dialog").getByLabel(/^Tags/).fill("first-home, fhog");
  await page.getByRole("dialog").getByLabel(/^Tags/).press("Enter");
  const panel = page.getByRole("dialog");
  const figures = [
    ["Loan amount", "680k"],
    ["Property value", "850k"],
    ["Household income (p.a.)", "182k"],
    ["Rate (% p.a.)", "6.04"],
    ["Lender", "ANZ"],
  ] as const;
  for (const [label, value] of figures) {
    await panel.getByLabel(label).fill(value);
    await panel.getByLabel(label).press("Enter");
  }
  await panel.getByText("80%").waitFor();
  await panel.getByText("Saved").waitFor();
  await page.screenshot({ path: `${OUT}/details-panel-desktop.png` });
  await panel.getByText("Key loan figures").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/key-figures-desktop.png` });
  await page.keyboard.press("Escape");

  // History panel
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("list", { name: "Versions, newest first" })
    .getByRole("button")
    .first()
    .click();
  await page.getByLabel("Version preview").waitFor();
  await page.screenshot({ path: `${OUT}/history-desktop.png` });
  await page.keyboard.press("Escape");

  await seedDemoNotes(EMAIL);
  await page.goto(`${BASE}/notes`);
  await page
    .getByRole("link", { name: /^Open note:/ })
    .first()
    .waitFor();
  await page.screenshot({ path: `${OUT}/notes-list-desktop.png` });
  await page.goto(`${BASE}/notes?q=offset`);
  await page.locator("mark").first().waitFor();
  await page.screenshot({ path: `${OUT}/notes-search-desktop.png` });

  // Finalised note with an amendment (on a seeded note)
  await page.goto(`${BASE}/notes`);
  await page.getByRole("link", { name: /Chen – lender rationale/ }).click();
  await page.getByRole("button", { name: "Finalise", exact: true }).click();
  await page.getByRole("button", { name: "Finalise note" }).click();
  await page.getByRole("note").waitFor();
  await page
    .getByLabel("Add an amendment")
    .fill("Client confirmed on 2 Dec that $20k of the deposit is a gift; gift letter on file.");
  await page.getByRole("button", { name: "Add amendment" }).click();
  await page.getByText("Amendment 1 ·").waitFor();
  await page.screenshot({ path: `${OUT}/finalised-desktop.png`, fullPage: true });

  // Import preview → clients list → client timeline
  await page.goto(`${BASE}/clients`);
  await page.getByRole("button", { name: "Import CSV" }).click();
  const csv = [
    "Full Name,E-mail,Mobile",
    "Asha Patel,asha@example.com,0400 111 222",
    "Ben Wong,,0411 222 333",
    ",nobody@example.com,",
    "Nguyen dup,NGUYEN@example.com,",
    "Chloe Smith,chloe@example.com,0422 333 444",
  ].join("\n");
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({ name: "crm-export.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page
    .getByRole("dialog")
    .getByText(/ready to import/)
    .waitFor();
  await page.waitForTimeout(400); // let the dialog finish animating in
  await page.screenshot({ path: `${OUT}/import-preview-desktop.png` });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Import \d/ })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.getByRole("link", { name: "Open client: Chloe Smith" }).waitFor();
  await page.screenshot({ path: `${OUT}/clients-desktop.png` });
  await page.getByRole("link", { name: "Open client: Nguyen family" }).click();
  await page.getByText(/File notes/).waitFor();
  await page.screenshot({ path: `${OUT}/client-timeline-desktop.png` });

  // Mobile, same session
  const storage = await ctx.storageState();
  const m = await browser.newContext({
    ...devices["iPhone 13"],
    storageState: storage,
    colorScheme: "light",
  });
  const mp = await m.newPage();
  await mp.goto(`${BASE}/notes`);
  await mp
    .getByRole("link", { name: /^Open note:/ })
    .first()
    .waitFor();
  await mp.screenshot({ path: `${OUT}/notes-list-mobile.png` });
  await mp.getByRole("button", { name: /^Filters/ }).click();
  await mp.getByRole("dialog").waitFor();
  await mp.waitForTimeout(400); // let the sheet finish sliding in
  await mp.screenshot({ path: `${OUT}/notes-filters-mobile.png` });
  await mp.keyboard.press("Escape");
  await mp.goto(noteUrl);
  await mp.getByRole("textbox", { name: "Note body" }).waitFor();
  await mp.screenshot({ path: `${OUT}/editor-mobile.png` });
  await mp.getByRole("button", { name: /^Details/ }).click();
  await mp.getByRole("dialog").getByText("Key loan figures").scrollIntoViewIfNeeded();
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: `${OUT}/details-mobile.png` });
  await mp.keyboard.press("Escape");
  await mp.goto(`${BASE}/clients`);
  await mp
    .getByRole("link", { name: /^Open client:/ })
    .first()
    .waitFor();
  await mp.screenshot({ path: `${OUT}/clients-mobile.png` });

  const dark = await browser.newContext({
    ...devices["iPhone 13"],
    storageState: storage,
    colorScheme: "dark",
  });
  const dp = await dark.newPage();
  await dp.goto(noteUrl);
  await dp.getByRole("textbox", { name: "Note body" }).waitFor();
  await dp.screenshot({ path: `${OUT}/editor-mobile-dark.png` });

  await browser.close();
  const db = new PrismaClient();
  await db.user.deleteMany({ where: { email: EMAIL } });
  await db.$disconnect();
  console.warn(`screenshots written to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
