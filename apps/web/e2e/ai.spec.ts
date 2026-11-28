import { expect, test } from "@playwright/test";

import { createBlankNote, register, saveStatus, uniqueEmail } from "./helpers";

/**
 * AI assist end to end. The API runs with AI_PROVIDER=mock (see playwright.config), which echoes
 * the text it received — so this also proves identifiers are removed before anything is "sent".
 */
test("AI assist: redacts, analyses, inserts action items and applies key figures", async ({
  page,
}) => {
  await register(page, "AI Broker", uniqueEmail("ai"));
  await createBlankNote(page);
  await page.getByLabel("Note title").fill("Discovery call – Patel");
  await page.getByRole("textbox", { name: "Note body" }).click();
  await page.keyboard.type(
    "Asha (TFN 123 456 782, mobile 0412 345 678) wants about $680k on an $850k place.",
  );
  await expect(saveStatus(page)).toHaveText(/^Saved$/, { timeout: 15_000 });

  await page.getByRole("button", { name: "AI assist", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(/analyses left today/)).toContainText("20 of 20");
  await panel.getByRole("button", { name: "Analyse note" }).click();

  // Result: labelled as AI, with redaction proof.
  await expect(panel.getByText("AI-generated")).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText(/Removed before sending: 1 TFN, 1 phone number/)).toBeVisible();
  const summary = panel.getByRole("region", { name: "Summary" });
  await expect(summary).toContainText("[TFN removed]");
  await expect(summary).not.toContainText("123 456 782");
  await expect(summary).not.toContainText("0412 345 678");
  await expect(panel.getByText(/19 of 20/)).toBeVisible();

  // Apply suggested figures → Details summary updates.
  await panel.getByRole("button", { name: /^Apply \d+ to details$/ }).click();
  await expect(panel.getByRole("button", { name: "Already in note details" })).toBeVisible();

  // Insert action items as a checklist → they land in the note body.
  await panel.getByRole("button", { name: "Insert as checklist" }).click();
  await page.keyboard.press("Escape");
  const body = page.getByRole("textbox", { name: "Note body" });
  await expect(body.locator('ul[data-type="taskList"] li')).toHaveCount(2);
  await expect(body).toContainText("Request 3 months of payslips");
  await expect(page.getByRole("button", { name: "Edit note details" })).toContainText(
    "$680k · 80% LVR",
  );

  // The note changed (checklist inserted) → the stored analysis is now stale.
  await expect(saveStatus(page)).toHaveText(/^Saved$/, { timeout: 15_000 });
  await page.getByRole("button", { name: "AI assist", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/note changed since/)).toBeVisible();
});
