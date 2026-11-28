// Phase 11 screenshots (slash menu, edit conflict, brokerage templates) using the demo brokerage.
// Usage: servers running, then: BASE_URL=http://localhost:3000 node scripts/screenshots-editor.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "../../docs/screenshots";
const PASSWORD = process.env.SEED_PASSWORD ?? "demo1234";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`);
await page.getByLabel("Email", { exact: true }).fill("demo@brokernotes.dev");
await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/\/dashboard/);

// Brokerage templates on the new-note page.
await page.goto(`${BASE}/notes/new`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Your brokerage's templates" }).scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/templates-desktop.png`, fullPage: true });

// A scratch note for the editor shots.
await page.getByRole("button", { name: "Create note from template: Blank note" }).click();
await page.waitForURL(/\/notes\/[a-z0-9]{20,}$/);
await page.waitForLoadState("networkidle");
const body = page.getByRole("textbox", { name: "Note body" });
await page.getByLabel("Note title").fill("Lender call – Patel");
await body.click();
await body.pressSequentially("Spoke to the ANZ assessor. ");
await page.keyboard.press("Enter");
await body.pressSequentially("/");
await page.getByRole("listbox", { name: "Insert block" }).waitFor();
await page.screenshot({ path: `${OUT}/slash-menu-desktop.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(2500); // autosave

// Edit conflict: the same note saved from a second tab first.
const other = await context.newPage();
await other.goto(page.url(), { waitUntil: "networkidle" });
const otherBody = other.getByRole("textbox", { name: "Note body" });
await otherBody.click();
await other.keyboard.press("End");
await otherBody.pressSequentially("Valuation ordered.");
await other.waitForTimeout(2500);
await body.click();
await page.keyboard.press("End");
await body.pressSequentially("Rental ledger still outstanding.");
await page.getByText("This note was changed elsewhere").waitFor({ timeout: 15000 });
await page.screenshot({ path: `${OUT}/edit-conflict-desktop.png` });

await browser.close();
console.warn(`screenshots written to ${OUT}`);
