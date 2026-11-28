import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { createBlankNote, register, saveStatus, uniqueEmail } from "./helpers";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());

const body = (page: Page) => page.getByRole("textbox", { name: "Note body" });

async function addClient(page: Page, name: string, email?: string) {
  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  if (email) await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test.describe("broker features", () => {
  test("client → template note → client timeline", async ({ page }) => {
    await register(page, "Template Broker", uniqueEmail("tpl"));
    await addClient(page, "Nguyen family", "nguyen@example.com");

    await page.getByRole("link", { name: "New note", exact: true }).click();
    await expect(page).toHaveURL(/\/notes\/new\?client=/);
    await expect(page.getByLabel("For client (optional)")).toContainText("Nguyen family");
    await page.getByRole("button", { name: "Create note from template: Fact find" }).click();

    await expect(page).toHaveURL(/\/notes\/[a-z0-9]{20,}$/);
    await expect(page.getByLabel("Note title")).toHaveValue("Fact find – Nguyen family");
    await expect(body(page).locator("h2").first()).toHaveText("Applicants");
    const summary = page.getByRole("button", { name: "Edit note details" });
    await expect(summary).toContainText("Nguyen family");
    await expect(summary).toContainText("Fact find");

    await page.goto("/clients");
    await page.getByRole("link", { name: "Open client: Nguyen family" }).click();
    await expect(
      page.getByRole("link", { name: "Open note: Fact find – Nguyen family" }),
    ).toBeVisible();
    await expect(page.getByText("File notes (1)")).toBeVisible();
  });

  test("key figures: shorthand amounts and automatic LVR", async ({ page }) => {
    await register(page, "Figures Broker", uniqueEmail("kf"));
    await createBlankNote(page);
    await page.getByRole("button", { name: /^Details/ }).click();
    const panel = page.getByRole("dialog");

    await panel.getByLabel("Loan amount").fill("680k");
    await panel.getByLabel("Loan amount").press("Enter");
    await panel.getByLabel("Property value").fill("$850,000");
    await panel.getByLabel("Property value").press("Enter");
    await expect(panel.getByText("80%")).toBeVisible();
    await expect(panel.getByLabel("Loan amount")).toHaveValue("$680,000");

    await panel.getByLabel("Property value").fill("abc");
    await panel.getByLabel("Property value").press("Enter");
    await expect(panel.getByRole("alert")).toContainText("850k");
    await panel.getByLabel("Property value").fill("800k");
    await panel.getByLabel("Property value").press("Enter");
    await expect(panel.getByText("85%")).toBeVisible();
    await expect(panel.getByText("LMI likely applies")).toBeVisible();
    await expect(panel.getByText("Saved")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("button", { name: "Edit note details" })).toContainText(
      "$680k · 85% LVR",
    );
  });

  test("finalise locks the note; amendments are appended", async ({ page }) => {
    await register(page, "Final Broker", uniqueEmail("final"));
    await createBlankNote(page);
    await page.getByLabel("Note title").fill("Lender rationale – Patel");
    await body(page).click();
    await page.keyboard.type("Recommended ANZ Simplicity PLUS at 6.04%.");

    // Finalise immediately — pending edits must be flushed first, not lost.
    await page.getByRole("button", { name: "Finalise", exact: true }).click();
    await page.getByRole("button", { name: "Finalise note" }).click();
    await expect(page.getByRole("note")).toContainText("Finalised");

    await page.reload();
    await expect(body(page)).toContainText("Recommended ANZ Simplicity PLUS at 6.04%.");
    await expect(body(page)).toHaveAttribute("contenteditable", "false");
    await expect(page.getByLabel("Note title")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("toolbar", { name: "Formatting" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Finalise", exact: true })).toHaveCount(0);

    // Record fields are locked in the details panel; workflow fields are not.
    await page.getByRole("button", { name: /^Details/ }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByLabel("Note type")).toBeDisabled();
    await expect(panel.getByLabel("Loan amount")).toBeDisabled();
    await expect(panel.getByLabel("Loan stage")).toBeEnabled();
    await page.keyboard.press("Escape");

    await page
      .getByLabel("Add an amendment")
      .fill("Client confirmed $20k of the deposit is a gift.");
    await page.getByRole("button", { name: "Add amendment" }).click();
    await expect(page.getByText("Amendment 1 ·")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Client confirmed $20k of the deposit is a gift.")).toBeVisible();

    // The list shows it as finalised
    await page.goto("/notes");
    await expect(page.getByRole("link", { name: /Lender rationale – Patel/ })).toContainText(
      "Finalised",
    );
  });

  test("version history: preview and restore an earlier version", async ({ page }) => {
    const email = uniqueEmail("history");
    await register(page, "History Broker", email);
    await createBlankNote(page);
    await page.getByLabel("Note title").fill("Version test");
    await body(page).click();
    await page.keyboard.type("Original wording.");
    await expect(saveStatus(page)).toHaveText(/^Saved$/, { timeout: 15_000 });

    // Snapshots are throttled to one per 5 minutes; age the existing ones so the next save snapshots.
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    await db.noteVersion.updateMany({
      where: { note: { userId: user.id } },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Rewritten wording.");
    await expect(saveStatus(page)).toHaveText(/^Saved$/, { timeout: 15_000 });

    await page.getByRole("button", { name: "History", exact: true }).click();
    const panel = page.getByRole("dialog");
    const versions = panel
      .getByRole("list", { name: "Versions, newest first" })
      .getByRole("button");
    await expect(versions).not.toHaveCount(0);
    // Pick the snapshot that contains the original wording.
    const count = await versions.count();
    let found = false;
    for (let i = 0; i < count && !found; i++) {
      await versions.nth(i).click();
      const preview = panel.getByLabel("Version preview");
      await expect(preview).toBeVisible();
      found = (await preview.textContent())?.includes("Original wording.") ?? false;
    }
    expect(found).toBe(true);
    await panel.getByRole("button", { name: "Restore this version" }).click();

    await expect(body(page)).toContainText("Original wording.");
    await expect(saveStatus(page)).toHaveText(/^Saved$/, { timeout: 15_000 });
    await page.reload();
    await expect(body(page)).toContainText("Original wording.");
  });

  test("CSV export is authenticated, Excel-safe and respects filters", async ({
    page,
    request,
  }) => {
    const anon = await request.get("/api/export/notes");
    expect(anon.status()).toBe(401);

    const email = uniqueEmail("csv");
    await register(page, "Export Broker", email);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    await db.note.createMany({
      data: [
        {
          userId: user.id,
          organisationId: user.organisationId,
          title: '=HYPERLINK("http://evil.example","x")',
          contentJson: doc,
          loanStage: "LEAD",
        },
        {
          userId: user.id,
          organisationId: user.organisationId,
          title: "Settled, with comma",
          contentJson: doc,
          loanStage: "SETTLED",
        },
      ],
    });

    const res = await page.request.get("/api/export/notes");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(
      /attachment; filename="brokernotes-notes-/,
    );
    const text = await res.text();
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM for Excel
    expect(text).toContain("Title,Client,Case,Author,Note type,Loan stage");
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`); // neutralised + quoted
    expect(text).toContain('"Settled, with comma"');

    const filtered = await (await page.request.get("/api/export/notes?stage=SETTLED")).text();
    expect(filtered).toContain("Settled, with comma");
    expect(filtered).not.toContain("HYPERLINK");
  });

  test("CSV import: map, preview, skip duplicates and invalid rows", async ({ page }) => {
    await register(page, "Import Broker", uniqueEmail("import"));
    await addClient(page, "Existing Client", "existing@example.com");
    await page.goto("/clients");

    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");
    const csv = [
      "Full Name,E-mail,Mobile",
      "Asha Patel,asha@example.com,0400 111 222",
      "Ben Wong,,0411 222 333",
      ",nobody@example.com,",
      "Dup Existing,EXISTING@example.com,",
      "Asha Again,asha@example.com,",
    ].join("\n");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "clients.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    await expect(dialog.getByLabel("Name (required)")).toContainText("Full Name");
    await expect(dialog.getByText(/2\s*ready to import/)).toBeVisible();
    await dialog.getByRole("button", { name: "Import 2 clients" }).click();
    await expect(dialog.getByRole("status")).toContainText("Imported 2");
    await expect(dialog.getByRole("status")).toContainText("skipped 2 duplicates");
    await expect(dialog.getByRole("status")).toContainText("1 invalid");
    await dialog.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("link", { name: "Open client: Asha Patel" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open client: Ben Wong" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Open client:/ })).toHaveCount(3);
  });
});
