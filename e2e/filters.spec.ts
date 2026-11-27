import { expect, test, type Page } from "@playwright/test";
import { PrismaClient, type LoanStage, type NoteType } from "@prisma/client";

import { register, uniqueEmail } from "./helpers";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());

type Seed = { title: string; text: string; stage?: LoanStage; type?: NoteType; tags?: string[] };

/** Seeds notes straight into the DB for the given user (faster than typing them in the UI). */
async function seedNotes(email: string, notes: Seed[]) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  for (const [i, n] of notes.entries()) {
    await db.note.create({
      data: {
        userId: user.id,
        title: n.title,
        contentText: n.text,
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: n.text }] }],
        },
        loanStage: n.stage ?? null,
        noteType: n.type ?? "GENERAL",
        tags: n.tags ?? [],
        // Stagger updatedAt so "last edited" order is deterministic: first seed = newest.
        updatedAt: new Date(Date.now() - i * 60_000),
      },
    });
  }
}

const SEEDS: Seed[] = [
  {
    title: "Nguyen – discovery call",
    text: "First home buyers in Parramatta, FHOG eligible.",
    stage: "LEAD",
    type: "DISCOVERY",
    tags: ["first-home"],
  },
  {
    title: "Patel – conditions",
    text: "Waiting on valuation from ANZ before unconditional approval.",
    stage: "CONDITIONAL",
    type: "CONDITIONS",
    tags: ["anz"],
  },
  {
    title: "Smith – refinance review",
    text: "Comparing CBA offset account vs current Westpac loan.",
    stage: "REVIEW",
    type: "REVIEW",
    tags: ["refinance"],
  },
];

const cardTitles = (page: Page) => page.getByRole("link", { name: /^Open note:/ });

/** Desktop shows filters inline; mobile puts them in a bottom sheet. */
async function chooseFilter(page: Page, label: string, option: string, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: /^Filters/ }).click();
  const scope = isMobile ? page.getByRole("dialog") : page;
  await scope.getByLabel(label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  if (isMobile) await page.getByRole("button", { name: "Show results" }).click();
}

test.describe("search & filters", () => {
  test("search narrows results, highlights matches and lives in the URL", async ({ page }) => {
    const email = uniqueEmail("search");
    await register(page, "Search Broker", email);
    await seedNotes(email, SEEDS);
    await page.goto("/notes");
    await expect(cardTitles(page)).toHaveCount(3);

    await page.getByRole("searchbox", { name: "Search notes" }).fill("valuation");
    await expect(page).toHaveURL(/[?&]q=valuation/);
    await expect(cardTitles(page)).toHaveCount(1);
    await expect(cardTitles(page).first()).toContainText("Patel – conditions");
    await expect(page.locator("mark", { hasText: "valuation" })).toBeVisible();
    await expect(page.getByText("1 result for “valuation”")).toBeVisible();

    // Shareable / reload-safe
    await page.reload();
    await expect(cardTitles(page)).toHaveCount(1);

    // No matches → helpful empty state
    await page.getByRole("searchbox", { name: "Search notes" }).fill("macquarie");
    await expect(page.getByRole("heading", { name: "No notes match" })).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(cardTitles(page)).toHaveCount(3);
  });

  test("filter by loan stage and note type", async ({ page, isMobile }) => {
    const email = uniqueEmail("filter");
    await register(page, "Filter Broker", email);
    await seedNotes(email, SEEDS);
    await page.goto("/notes");

    await chooseFilter(page, "Loan stage", "Conditional", isMobile);
    await expect(page).toHaveURL(/stage=CONDITIONAL/);
    await expect(cardTitles(page)).toHaveCount(1);
    await expect(cardTitles(page).first()).toContainText("Patel");

    await page.goto("/notes?type=REVIEW");
    await expect(cardTitles(page)).toHaveCount(1);
    await expect(cardTitles(page).first()).toContainText("Smith");

    await page.goto("/notes?tag=first-home");
    await expect(cardTitles(page)).toHaveCount(1);
    await expect(cardTitles(page).first()).toContainText("Nguyen");

    // Garbage params are ignored, not errors
    await page.goto("/notes?stage=NOPE&sort=whatever");
    await expect(cardTitles(page)).toHaveCount(3);
  });

  test("details panel: stage, follow-up today, tags → badges + follow-ups due + pin", async ({
    page,
  }) => {
    const email = uniqueEmail("details");
    await register(page, "Details Broker", email);
    await seedNotes(email, SEEDS);
    await page.goto("/notes");

    // Open the oldest note (last card) and set its details
    await cardTitles(page).filter({ hasText: "Smith" }).click();
    await page.getByRole("button", { name: /^Details/ }).click();
    const panel = page.getByRole("dialog");
    await panel.getByLabel("Loan stage").click();
    await page.getByRole("option", { name: "Settled", exact: true }).click();

    const today = await page.evaluate(() =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date()),
    );
    await panel.getByLabel("Follow-up date").fill(today);
    await panel.getByLabel(/^Tags/).fill("Priority");
    await panel.getByLabel(/^Tags/).press("Enter");
    await expect(panel.getByText("#Priority")).toBeVisible();
    await expect(panel.getByText("Saved")).toBeVisible();
    await page.keyboard.press("Escape");

    // Summary under the title reflects the details
    await expect(page.getByRole("button", { name: "Edit note details" })).toContainText("Settled");
    await expect(page.getByRole("button", { name: "Edit note details" })).toContainText(
      "Follow up today",
    );

    // List: badges, follow-ups due count, and the due filter
    await page.getByRole("link", { name: "All notes" }).click();
    const smith = page.locator("li", { has: page.getByRole("link", { name: /Smith/ }) });
    await expect(smith).toContainText("Follow up today");
    await expect(smith).toContainText("#Priority");
    const due = page.getByRole("button", { name: /Follow-ups due/ }).locator("visible=true");
    await expect(due).toContainText("1");
    await due.click();
    await expect(page).toHaveURL(/due=1/);
    await expect(cardTitles(page)).toHaveCount(1);
    await due.click();
    await expect(cardTitles(page)).toHaveCount(3);

    // Editing details counts as an edit, so Smith is now the most recently edited note.
    await expect(cardTitles(page).first()).toContainText("Smith");
    // Pin the least recently edited note (Patel, last) → it jumps to the top.
    await expect(cardTitles(page).last()).toContainText("Patel");
    await page.getByRole("button", { name: /Actions for Patel/ }).click();
    await page.getByRole("menuitem", { name: "Pin to top" }).click();
    await expect(cardTitles(page).first()).toContainText("Patel");
    await expect(page.getByRole("img", { name: "Pinned" })).toHaveCount(1);
  });
});
