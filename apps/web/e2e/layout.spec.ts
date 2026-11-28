import { expect, test, type Page } from "@playwright/test";

import { createBlankNote, register, saveStatus, uniqueEmail } from "./helpers";

const LONG = "Wolfeschlegelsteinhausenbergerdorff-Montgomery-Featherstonehaugh family trust";

async function noSidewaysScroll(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
}

/** Long names and references must never push a page wider than the screen (phones especially). */
test("main pages never scroll sideways, even with very long names", async ({ page }) => {
  test.slow();
  await register(page, LONG, uniqueEmail("layout-with-a-rather-long-email-address"));

  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill(LONG);
  await page.getByRole("dialog").getByRole("button", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { level: 1, name: LONG })).toBeVisible();
  const clientPath = new URL(page.url()).pathname;

  await page.getByRole("button", { name: "New case" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Loan type").click();
  await page.getByRole("option", { name: "Top-up / equity release" }).click();
  await dialog.getByLabel("Lender", { exact: true }).fill("Commonwealth Bank of Australia");
  await dialog.getByRole("button", { name: "Open case" }).click();
  await expect(page).toHaveURL(/\/cases\/[a-z0-9]{20,}$/);
  const casePath = new URL(page.url()).pathname;

  await createBlankNote(page);
  await page.getByLabel("Note title").fill(`${LONG} — refinance and top-up discussion notes`);
  await page.getByRole("textbox", { name: "Note body" }).click();
  await page.getByRole("textbox", { name: "Note body" }).pressSequentially("Pinned for layout.");
  await expect(saveStatus(page)).toHaveText(/Saved/, { timeout: 15_000 });
  const notePath = new URL(page.url()).pathname;

  for (const path of [
    "/dashboard",
    "/notes",
    "/cases?status=all",
    "/clients",
    clientPath,
    casePath,
    notePath,
    "/tasks?view=all",
    "/settings/team",
  ]) {
    await noSidewaysScroll(page, path);
  }
});
