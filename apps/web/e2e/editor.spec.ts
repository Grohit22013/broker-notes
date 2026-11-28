import { expect, test, type Page } from "@playwright/test";

import { createBlankNote, register, saveStatus, uniqueEmail } from "./helpers";

const body = (page: Page) => page.getByRole("textbox", { name: "Note body" });

async function typeAndSave(page: Page, text: string) {
  await body(page).click();
  await page.keyboard.press("End");
  await body(page).pressSequentially(text);
  await expect(saveStatus(page)).toHaveText(/Saved/, { timeout: 15_000 });
}

test.describe("Phase 11: editor and reliability", () => {
  test("two tabs editing one note: the second save is stopped, not lost", async ({ page }) => {
    test.slow();
    await register(page, "Tab Broker", uniqueEmail("tabs"));
    await createBlankNote(page);
    await typeAndSave(page, "First tab wrote this.");

    // Same note in a second tab: it saves first.
    const other = await page.context().newPage();
    await other.goto(page.url());
    await typeAndSave(other, " Second tab added this.");

    // Back in the first tab (still on the old revision): its next save is refused.
    await body(page).click();
    await page.keyboard.press("End");
    await body(page).pressSequentially(" Mine too.");
    const banner = page.getByRole("alert").filter({ hasText: "This note was changed elsewhere" });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(saveStatus(page)).toContainText("changed elsewhere");

    // Keep mine → saved on top; a fresh load shows the first tab's version.
    await banner.getByRole("button", { name: "Keep mine" }).click();
    await expect(saveStatus(page)).toHaveText(/Saved/, { timeout: 15_000 });
    await other.reload();
    await expect(body(other)).toContainText("First tab wrote this. Mine too.");
    await expect(body(other)).not.toContainText("Second tab added this.");
    await other.close();
  });

  test("unsaved edits survive a lost connection and can be restored", async ({ page }) => {
    test.slow();
    await register(page, "Offline Broker", uniqueEmail("draft"));
    await createBlankNote(page);
    await typeAndSave(page, "Saved before the outage.");
    const url = page.url();

    // Connection drops; the broker keeps typing; the tab is closed.
    await page.context().setOffline(true);
    await body(page).click();
    await page.keyboard.press("End");
    await body(page).pressSequentially(" Typed while offline.");
    await expect(saveStatus(page)).toContainText(/Not saved|Couldn/, { timeout: 15_000 });
    const context = page.context();
    await page.close();
    await context.setOffline(false);

    // Reopening the note offers the lost edits.
    const again = await context.newPage();
    await again.goto(url);
    const banner = again.getByRole("alert").filter({ hasText: "Unsaved changes found" });
    await expect(banner).toBeVisible();
    await expect(body(again)).not.toContainText("Typed while offline.");
    await banner.getByRole("button", { name: "Restore my changes" }).click();
    await expect(body(again)).toContainText("Saved before the outage. Typed while offline.");
    await expect(saveStatus(again)).toHaveText(/Saved/, { timeout: 15_000 });
    await again.reload();
    await expect(body(again)).toContainText("Typed while offline.");
    await expect(again.getByText("Unsaved changes found")).toHaveCount(0);
  });

  test("slash commands, favourites, drafts filter and brokerage templates", async ({ page }) => {
    test.slow();
    await register(page, "Power Broker", uniqueEmail("power"));
    await createBlankNote(page);
    await page.getByLabel("Note title").fill("Lender call checklist");

    // "/" opens the block menu; Enter inserts a checklist.
    await body(page).click();
    await body(page).pressSequentially("/check");
    await expect(page.getByRole("option", { name: /Checklist/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(body(page).locator('ul[data-type="taskList"]')).toHaveCount(1);
    await body(page).pressSequentially("Ask for valuation report");
    await expect(saveStatus(page)).toHaveText(/Saved/, { timeout: 15_000 });

    // Star it.
    await page.getByRole("button", { name: "Add to favourites" }).click();
    await expect(page.getByRole("button", { name: "Remove from favourites" })).toBeVisible();

    // Save it as a brokerage template.
    await page.getByRole("button", { name: "Note actions" }).click();
    await page.getByRole("menuitem", { name: "Save as template…" }).click();
    const dialog = page.getByRole("dialog", { name: "Save as template" });
    await dialog.getByLabel("Template name").fill("Valuation chase");
    await dialog.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText(/Template “Valuation chase” saved/)).toBeVisible();

    // A second, unstarred note to filter against.
    await createBlankNote(page);
    await page.getByLabel("Note title").fill("Other note");
    await expect(saveStatus(page)).toHaveText(/Saved/, { timeout: 15_000 });

    await page.goto("/notes?fav=1");
    await expect(
      page.getByRole("link", { name: "Open note: Lender call checklist" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Open note: Other note" })).toHaveCount(0);
    await page.goto("/notes?drafts=1");
    await expect(page.getByRole("link", { name: "Open note: Other note" })).toBeVisible();

    // New notes can start from the brokerage template.
    await page.goto("/notes/new");
    await page.getByRole("button", { name: "Create note from template: Valuation chase" }).click();
    await expect(page).toHaveURL(/\/notes\/[a-z0-9]{20,}$/);
    await expect(page.getByLabel("Note title")).toHaveValue("Valuation chase");
    await expect(body(page)).toContainText("Ask for valuation report");
  });
});
