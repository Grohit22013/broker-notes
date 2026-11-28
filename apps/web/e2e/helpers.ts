import { expect, type Page } from "@playwright/test";

/** All E2E accounts use this domain so teardown can remove exactly them. */
export const E2E_EMAIL_DOMAIN = "e2e.brokernotes.test";
export const E2E_PASSWORD = "secure123";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${E2E_EMAIL_DOMAIN}`;
}

export async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Confirm password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // Registration hashes the password twice (create + sign-in): allow for slow machines.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

/** The save indicator is rendered twice (mobile/desktop placements); use the visible one. */
export function saveStatus(page: Page) {
  return page.getByRole("status").locator("visible=true").first();
}

export async function createBlankNote(page: Page) {
  await page.goto("/notes/new");
  await page.getByRole("button", { name: "Create note from template: Blank note" }).click();
  await expect(page).toHaveURL(/\/notes\/[a-z0-9]{20,}$/);
  await expect(page.getByRole("textbox", { name: "Note body" })).toBeVisible();
}
