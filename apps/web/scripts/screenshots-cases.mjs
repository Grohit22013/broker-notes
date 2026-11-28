// Phase 9 screenshots (dashboard, cases) using the seeded demo brokerage.
// Usage: servers running (API :4000, web :3100), then: node scripts/screenshots-cases.mjs
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

const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const admin = await signIn(desktop, "demo@brokernotes.dev");
await admin.getByRole("heading", { level: 1 }).waitFor();
await admin.screenshot({ path: `${OUT}/dashboard-desktop.png` });

await admin.goto(`${BASE}/cases?status=all`);
await admin.getByRole("heading", { level: 1, name: "Cases" }).waitFor();
await admin.screenshot({ path: `${OUT}/cases-desktop.png` });

await admin.getByRole("link", { name: /Open case HL-\d{4}-0003/ }).click();
await admin.waitForURL(/\/cases\/[a-z0-9]{20,}$/);
await admin.waitForLoadState("networkidle");
await admin.getByRole("heading", { name: /File notes/ }).waitFor();
await admin.screenshot({ path: `${OUT}/case-detail-desktop.png`, fullPage: true });

const phone = await browser.newContext({ ...devices["iPhone 13"] });
const adviser = await signIn(phone, "adviser@brokernotes.dev");
await adviser.getByRole("heading", { level: 1 }).waitFor();
await adviser.screenshot({ path: `${OUT}/dashboard-mobile.png` });
await adviser.goto(`${BASE}/cases`);
await adviser.getByRole("link", { name: /Open case HL-\d{4}-0002/ }).click();
await adviser.waitForURL(/\/cases\/[a-z0-9]{20,}$/);
await adviser.waitForLoadState("networkidle");
await adviser.getByRole("heading", { level: 1, name: /HL-/ }).waitFor();
await adviser.screenshot({ path: `${OUT}/case-detail-mobile.png` });

await browser.close();
console.warn(`screenshots written to ${OUT}`);
