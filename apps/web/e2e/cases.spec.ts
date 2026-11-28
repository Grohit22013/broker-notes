import { expect, test } from "@playwright/test";

import { register, uniqueEmail } from "./helpers";

/** Phase 9: client → case → pipeline → case note → dashboard → search by reference. */
test("open a case, move it through the pipeline and keep its notes together", async ({ page }) => {
  test.slow();
  await register(page, "Case Broker", uniqueEmail("cases"));

  // The dashboard is the landing page.
  await expect(
    page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Case/ }),
  ).toBeVisible();

  // A client to open the case for.
  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill("Nguyen family");
  await page.getByRole("dialog").getByRole("button", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nguyen family" })).toBeVisible();

  // Open a case from the client page.
  await page.getByRole("button", { name: "New case" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Loan type").click();
  await page.getByRole("option", { name: "First home purchase" }).click();
  await dialog.getByLabel("Loan amount").fill("680k");
  await dialog.getByLabel("Property value").fill("850k");
  await dialog.getByLabel("Lender", { exact: true }).fill("ANZ");
  await dialog.getByRole("button", { name: "Open case" }).click();

  await expect(page).toHaveURL(/\/cases\/[a-z0-9]{20,}$/);
  const reference = (await page.getByRole("heading", { level: 1 }).textContent())?.trim() ?? "";
  expect(reference).toMatch(/^HL-\d{4}-0001$/);
  const caseUrl = page.url();
  await expect(page.getByText("80%", { exact: true })).toBeVisible(); // LVR
  await expect(page.getByRole("button", { name: "Enquiry (current stage)" })).toBeVisible();

  // Move it through the pipeline.
  // (Retried: a click that lands before the page hydrates does nothing.)
  await expect(async () => {
    await page.getByRole("button", { name: "Move to Lodged" }).click();
    await expect(page.getByRole("button", { name: "Lodged (current stage)" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText("Moved to Lodged")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Lodged (current stage)" })).toBeVisible();

  // A note written from the case belongs to it (and its client).
  await page.getByRole("link", { name: "New note" }).first().click();
  await expect(page.getByText(`For case ${reference}`)).toBeVisible();
  await page.getByRole("button", { name: "Create note from template: Discovery call" }).click();
  await expect(page).toHaveURL(/\/notes\/[a-z0-9]{20,}$/);
  const summary = page.getByRole("button", { name: "Edit note details" });
  await expect(summary).toContainText(reference);
  await expect(summary).toContainText("Nguyen family");

  // The case timeline lists it.
  await page.goto(caseUrl);
  await expect(page.getByRole("heading", { name: /File notes/ })).toContainText("(1)");

  // Notes can be found by case reference.
  await page.goto(`/notes?q=${reference}`);
  await expect(
    page.getByRole("link", { name: /Open note: Discovery call – Nguyen family/ }),
  ).toBeVisible();

  // The dashboard pipeline counts it.
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Lodged: 1 case" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open cases/ })).toContainText("1");

  // And the cases list filters by stage.
  await page.getByRole("link", { name: "Lodged: 1 case" }).click();
  await expect(page).toHaveURL(/\/cases\?stage=LODGED/);
  await expect(
    page.getByRole("link", { name: `Open case ${reference} for Nguyen family` }),
  ).toBeVisible();
});
