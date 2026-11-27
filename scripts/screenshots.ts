/**
 * Captures UI screenshots (mobile + desktop) for PRs and the README.
 * Usage: build + start the app on :3100, then `npx tsx scripts/screenshots.ts <outDir>`.
 * Creates a throwaway demo account (removed at the end).
 */
import { chromium, devices, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

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

  await page.goto(`${BASE}/notes`);
  await page
    .getByRole("link", { name: /^Open note:/ })
    .first()
    .waitFor();
  await page.screenshot({ path: `${OUT}/notes-list-desktop.png` });

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
