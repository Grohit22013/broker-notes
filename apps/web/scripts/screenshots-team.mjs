// Phase 8 screenshots (team, audit log, view-only note) using the seeded demo brokerage.
// Usage: servers running (API :4000, web :3100), then: node scripts/screenshots-team.mjs
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
  await page.waitForURL(/\/notes/);
  return page;
}

const browser = await chromium.launch();
const desktop = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const admin = await signIn(desktop, "demo@brokernotes.dev");

await admin.goto(`${BASE}/settings/team`);
await admin.getByRole("heading", { level: 1, name: "Team" }).waitFor();
await admin.screenshot({ path: `${OUT}/team-desktop.png`, fullPage: true });

await admin.getByRole("button", { name: "Invite member" }).click();
await admin.getByRole("dialog").getByLabel("Email").fill("new.adviser@example.com");
await admin.screenshot({ path: `${OUT}/invite-dialog-desktop.png` });
await admin.keyboard.press("Escape");

await admin.goto(`${BASE}/settings/audit`);
await admin.getByRole("heading", { level: 1, name: "Audit log" }).waitFor();
await admin.screenshot({ path: `${OUT}/audit-log-desktop.png` });

// Case manager on a phone: the notes list (with authors) and someone else's note, read-only.
const phone = await browser.newContext({ ...devices["iPhone 13"] });
const cm = await signIn(phone, "casemanager@brokernotes.dev");
await cm.screenshot({ path: `${OUT}/notes-case-manager-mobile.png` });
await cm
  .getByRole("link", { name: /Fact find/ })
  .first()
  .click();
await cm.getByText("View only.").waitFor();
await cm.screenshot({ path: `${OUT}/note-view-only-mobile.png` });

await browser.close();
console.warn(`screenshots written to ${OUT}`);
