// Phase 10 screenshots (tasks page, a note's tasks panel) using the seeded demo brokerage.
// Usage: servers running (API :4000, web :3100), then: node scripts/screenshots-tasks.mjs
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "../../docs/screenshots";
const PASSWORD = process.env.SEED_PASSWORD ?? "demo1234";

async function signIn(context, email) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  return page;
}

const browser = await chromium.launch();

const desktop = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const admin = await signIn(desktop, "demo@brokernotes.dev");
await admin.goto(`${BASE}/tasks?view=all`, { waitUntil: "networkidle" });
await admin.screenshot({ path: `${OUT}/tasks-desktop.png` });

const phone = await browser.newContext({ ...devices["iPhone 13"] });
const adviser = await signIn(phone, "adviser@brokernotes.dev");
await adviser.goto(`${BASE}/notes`, { waitUntil: "networkidle" });
const href = await adviser
  .getByRole("link", { name: /Open note: Discovery call/ })
  .first()
  .getAttribute("href");
await adviser.goto(BASE + href, { waitUntil: "networkidle" });
await adviser.getByRole("button", { name: /^Tasks \(/ }).click();
await adviser.getByRole("dialog", { name: "Follow-up tasks" }).waitFor();
await adviser.waitForTimeout(400);
await adviser.screenshot({ path: `${OUT}/note-tasks-mobile.png` });

await browser.close();
console.warn(`screenshots written to ${OUT}`);
