import { expect, test } from "@playwright/test";

import { register, saveStatus, uniqueEmail } from "./helpers";

/** "YYYY-MM-DD" for today in Sydney (the app's calendar day). */
const sydneyToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

test("add a client inline, log a meeting, see it on the calendar, apply AI-spotted dates", async ({
  page,
}) => {
  test.slow();
  await register(page, "Calendar Broker", uniqueEmail("cal"));

  // New note → "+ Add client…" without leaving the page.
  await page.goto("/notes/new");
  await expect(async () => {
    await page.getByLabel("For client (optional)").click();
    await page.getByRole("option", { name: "+ Add client…" }).click({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const dialog = page.getByRole("dialog", { name: "New client" });
  await dialog.getByLabel("Name").fill("Inline Client");
  await dialog.getByRole("button", { name: "Add client" }).click();
  await expect(page).toHaveURL(/\/notes\/new/);
  await expect(page.getByLabel("For client (optional)")).toContainText("Inline Client");

  // A client-meeting note starts with today as its meeting.
  await page.getByRole("button", { name: "Create note from template: Client meeting" }).click();
  await expect(page).toHaveURL(/\/notes\/[a-z0-9]{20,}$/);
  await expect(page.getByLabel("Note title")).toHaveValue("Client meeting – Inline Client");
  const summary = page.getByRole("button", { name: "Edit note details" });
  await expect(summary).toContainText("Meeting ·");
  const noteUrl = new URL(page.url()).pathname;

  // Set the meeting time precisely in Details.
  await summary.click();
  const details = page.getByRole("dialog", { name: "Note details" });
  await details.getByLabel("Meeting date & time").fill(`${sydneyToday()}T10:30`);
  await expect(details.getByText("Saved")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(summary).toContainText("10:30");

  // The dashboard calendar shows it today, linked to the note.
  await page.goto("/dashboard");
  const calendar = page.getByRole("region", { name: "Calendar" });
  const today = calendar.getByRole("list", { name: /^Scheduled on/ });
  await expect(today.getByRole("link", { name: /Client meeting – Inline Client/ })).toHaveAttribute(
    "href",
    noteUrl,
  );
  await expect(today).toContainText("10:30");
  await expect(today).toContainText("Inline Client");

  // AI (mock provider) spots dates; one click applies them.
  await page.goto(noteUrl);
  const body = page.getByRole("textbox", { name: "Note body" });
  await body.click();
  await page.keyboard.press("End");
  await body.pressSequentially("Call back next week; valuation due soon.");
  await expect(saveStatus(page)).toHaveText(/Saved/, { timeout: 15_000 });
  await page.getByRole("button", { name: "AI assist", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Analyse note" }).click();
  const dates = panel.getByRole("region", { name: "Dates found" });
  await expect(dates.getByText("Call back about payslips (mock)")).toBeVisible({ timeout: 20_000 });
  await dates.getByRole("button", { name: "Set as follow-up" }).click();
  await expect(dates.getByText("Set as the follow-up date")).toBeVisible();
  await dates.getByRole("button", { name: "Set as meeting time" }).click();
  await expect(dates.getByText("Set as the meeting time")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(summary).toContainText("10:30"); // mock meeting time
  await expect(summary).toContainText(/Follow up/);
});
