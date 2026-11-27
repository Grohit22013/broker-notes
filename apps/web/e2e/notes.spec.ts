import { expect, test } from "@playwright/test";

import { createBlankNote, register, saveStatus, uniqueEmail } from "./helpers";

test.describe("access control", () => {
  test("signed-out visitors are sent to login with a relative callback", async ({ page }) => {
    await page.goto("/notes");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fnotes$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});

test.describe("notes with the Tiptap editor", () => {
  test("create → format → autosave → reload → list → delete", async ({ page }) => {
    await register(page, "Asha Broker", uniqueEmail("flow"));

    // Empty state on first visit
    await expect(page.getByRole("heading", { name: "No notes yet" })).toBeVisible();
    await page.getByRole("link", { name: "Create your first note" }).click();
    await page.getByRole("button", { name: "Create note from template: Blank note" }).click();
    await expect(page).toHaveURL(/\/notes\/[a-z0-9]{20,}$/);
    const noteUrl = page.url();

    // Title
    await page.getByLabel("Note title").fill("Discovery call – Nguyen family");

    // Body: heading, paragraph with bold text, and a checklist (via Markdown shortcuts + toolbar)
    const body = page.getByRole("textbox", { name: "Note body" });
    await body.click();
    await page.keyboard.type("## Goals");
    await page.keyboard.press("Enter");
    await page.keyboard.type("First home in Parramatta, budget ");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type("$850k");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Checklist" }).click();
    await page.keyboard.type("Request 3 months of payslips");

    await expect(body.locator("h2")).toHaveText("Goals");
    await expect(body.locator("strong")).toHaveText("$850k");
    await expect(body.locator('ul[data-type="taskList"] li')).toHaveCount(1);

    // Autosave kicks in after the debounce
    await expect(saveStatus(page)).toHaveText(/^Saved$/, { timeout: 15_000 });

    // Reload: everything persisted exactly
    await page.reload();
    await expect(page.getByLabel("Note title")).toHaveValue("Discovery call – Nguyen family");
    const reloaded = page.getByRole("textbox", { name: "Note body" });
    await expect(reloaded.locator("h2")).toHaveText("Goals");
    await expect(reloaded.locator("strong")).toHaveText("$850k");
    await expect(reloaded.locator('ul[data-type="taskList"] li')).toContainText(
      "Request 3 months of payslips",
    );

    // Appears in the list with a snippet
    await page.getByRole("link", { name: "All notes" }).click();
    await expect(page).toHaveURL(/\/notes$/);
    const card = page.getByRole("link", { name: "Open note: Discovery call – Nguyen family" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("First home in Parramatta");

    // Delete from the list (with confirmation)
    await page.getByRole("button", { name: "Actions for Discovery call – Nguyen family" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(page.getByRole("heading", { name: "No notes yet" })).toBeVisible();

    // A deleted note can no longer be opened
    await page.goto(noteUrl);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("continuous typing still autosaves (no waiting for a pause)", async ({ page }) => {
    await register(page, "Typing Broker", uniqueEmail("typing"));
    await createBlankNote(page);

    // Count autosave requests (PUT /api/notes/:id/content → NestJS API).
    let saves = 0;
    page.on("request", (req) => {
      if (req.method() === "PUT" && /\/api\/notes\/[^/]+\/content$/.test(req.url())) saves += 1;
    });

    await page.getByRole("textbox", { name: "Note body" }).click();
    // ~7s of uninterrupted typing — shorter gaps than the 1.5s debounce the whole time.
    await page.keyboard.type(
      "Client called about pre-approval expiry and wants to compare fixed vs variable.",
      { delay: 90 },
    );
    expect(saves).toBeGreaterThanOrEqual(1); // maxWait forced a save mid-typing

    await expect(saveStatus(page)).toHaveText(/^Saved$/, { timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Note body" })).toContainText(
      "compare fixed vs variable",
    );
  });

  test("a broker cannot open another broker's note", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await register(owner, "Owner Broker", uniqueEmail("owner"));
    await createBlankNote(owner);
    await owner.getByLabel("Note title").fill("Confidential – Smith refinance");
    await expect(saveStatus(owner)).toHaveText(/^Saved$/, { timeout: 15_000 });
    const privateUrl = owner.url();

    const intruderCtx = await browser.newContext();
    const intruder = await intruderCtx.newPage();
    await register(intruder, "Other Broker", uniqueEmail("intruder"));
    await intruder.goto(privateUrl);
    await expect(intruder.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(intruder.getByText("Confidential – Smith refinance")).toHaveCount(0);

    await intruder.goto("/notes");
    await expect(intruder.getByRole("heading", { name: "No notes yet" })).toBeVisible();

    await ownerCtx.close();
    await intruderCtx.close();
  });
});
