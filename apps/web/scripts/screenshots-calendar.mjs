// Phase 12 screenshots (dashboard calendar, inline add client) using the demo brokerage.
// Usage: servers running, then: BASE_URL=http://localhost:3000 node scripts/screenshots-calendar.mjs
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
  await page.waitForLoadState("networkidle");
  return page;
}

const browser = await chromium.launch();

const desktop = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const admin = await signIn(desktop, "demo@brokernotes.dev");
await admin.screenshot({ path: `${OUT}/dashboard-calendar-desktop.png` });

await admin.goto(`${BASE}/notes/new`, { waitUntil: "networkidle" });
await admin.getByLabel("For client (optional)").click();
await admin.getByRole("option", { name: "+ Add client…" }).click();
const addDialog = admin.getByRole("dialog", { name: "New client" });
await addDialog.getByLabel("Name").fill("Mia Thompson");
await admin.waitForTimeout(600); // let the dropdown close and the dialog finish animating
await admin.screenshot({ path: `${OUT}/new-note-add-client-desktop.png` });

const phone = await browser.newContext({ ...devices["iPhone 13"] });
const adviser = await signIn(phone, "adviser@brokernotes.dev");
await adviser.getByRole("region", { name: "Calendar" }).scrollIntoViewIfNeeded();
await adviser.screenshot({ path: `${OUT}/calendar-mobile.png` });

await browser.close();
console.warn(`screenshots written to ${OUT}`);
