/**
 * Captures UI screenshots (mobile + desktop) for PRs and the README.
 * Usage: build + start the app on :3100, then `npx tsx scripts/screenshots.ts <outDir>`.
 * Creates a throwaway demo account (removed at the end).
 */
import { chromium, devices, type Page } from "@playwright/test";
import { PrismaClient, type LoanStage, type NoteType } from "@prisma/client";

import { zonedMidnight, zonedYmd } from "../lib/dates";

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

  await page.getByRole("button", { name: "Create your first note" }).click();
  await page.waitForURL(/\/notes\/.+/);
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
  await page.getByRole("dialog").getByText("Saved").waitFor();
  await page.screenshot({ path: `${OUT}/details-panel-desktop.png` });
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
