import { expect, test, type Page } from "@playwright/test";

import { createBlankNote, E2E_PASSWORD, register, saveStatus, uniqueEmail } from "./helpers";

const body = (page: Page) => page.getByRole("textbox", { name: "Note body" });

/** Phase 8: a brokerage admin invites a case manager, who gets read-only access to others' notes. */
test("invite → join as case manager → view-only access → audit → deactivate", async ({
  page,
  browser,
}) => {
  test.slow(); // two accounts, two browsers, several bcrypt hashes

  // ── Admin: registers (creating the brokerage) and writes a note ──
  await register(page, "Team Admin", uniqueEmail("admin"));
  await createBlankNote(page);
  await page.getByLabel("Note title").fill("Admin fact find");
  await body(page).click();
  await body(page).pressSequentially("Deposit is $170k plus FHOG.");
  await expect(saveStatus(page)).toHaveText(/Saved/, { timeout: 15_000 });
  const noteUrl = page.url();

  // ── Admin: creates an invite link for a case manager ──
  await page.goto("/settings/team");
  await expect(page.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
  await page.getByRole("button", { name: "Invite member" }).click();
  const invite = page.getByRole("dialog");
  const inviteeEmail = uniqueEmail("cm");
  await invite.getByLabel("Email").fill(inviteeEmail);
  await invite.getByLabel("Role").click();
  await page.getByRole("option", { name: "Case manager" }).click();
  await invite.getByRole("button", { name: "Create invite link" }).click();
  const link = await invite.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/register\?invite=[A-Za-z0-9_-]{43}$/);
  await invite.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(inviteeEmail)).toBeVisible(); // pending invite listed

  // ── Invitee (separate browser): joins the brokerage from the link ──
  const other = await browser.newContext();
  const cm = await other.newPage();
  await cm.goto(link);
  await expect(cm.getByRole("heading", { name: "Join Team Admin's brokerage" })).toBeVisible();
  await expect(cm.getByText("invited you as")).toContainText("Case manager");
  await expect(cm.getByLabel("Work email")).toHaveValue(inviteeEmail);
  await cm.getByLabel("Full name").fill("Sam Case");
  await cm.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await cm.getByLabel("Confirm password").fill(E2E_PASSWORD);
  await cm.getByRole("button", { name: "Join brokerage" }).click();
  await expect(cm).toHaveURL(/\/notes$/, { timeout: 30_000 });

  // Sees the brokerage's note, credited to its author, but can't export…
  await expect(cm.getByText("by Team Admin")).toBeVisible();
  await expect(cm.getByRole("link", { name: /Export/ })).toHaveCount(0);
  // …and opens it read-only.
  await cm.goto(noteUrl);
  await expect(cm.getByText("View only.")).toBeVisible();
  await expect(body(cm)).toHaveAttribute("contenteditable", "false");
  await expect(cm.getByRole("button", { name: /Finalise/ })).toHaveCount(0);
  await expect(cm.getByRole("button", { name: "Note actions" })).toHaveCount(0);
  // Can view clients but not add them.
  await cm.goto("/clients");
  await expect(cm.getByRole("button", { name: "New client" })).toHaveCount(0);

  // ── Admin: sees the new member and the audit trail ──
  await page.goto("/settings/team");
  await expect(page.getByText("Sam Case")).toBeVisible();
  await page.goto("/settings/audit");
  await expect(page.getByText("Joined as Case manager")).toBeVisible();
  await expect(page.getByText(`Invited ${inviteeEmail} as Case manager`)).toBeVisible();
  await page.getByRole("link", { name: "Team & settings" }).click();
  await expect(page).toHaveURL(/category=team/);
  await expect(page.getByText("Created “Admin fact find”")).toHaveCount(0);

  // ── Admin deactivates the case manager: their next request ends the session ──
  await page.goto("/settings/team");
  await page.getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Deactivated", { exact: true })).toBeVisible();

  await cm.goto("/notes");
  await expect(cm).toHaveURL(/\/login\?/);
  await expect(cm.getByText("Your session has ended")).toBeVisible();
  // Signing in again is refused with a clear reason.
  await cm.getByLabel("Email", { exact: true }).fill(inviteeEmail);
  await cm.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD);
  await cm.getByRole("button", { name: "Sign in" }).click();
  await expect(cm.getByText(/This account has been deactivated/)).toBeVisible();
  await other.close();
});

test("a new registrant administers their own brokerage", async ({ page }) => {
  await register(page, "Solo Admin", uniqueEmail("solo"));
  await page.goto("/settings/team");
  await expect(page.getByLabel("Brokerage name")).toHaveValue("Solo Admin's brokerage");
  // Long member emails must never push the page sideways on a phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByLabel("Brokerage name").fill("Solo Lending");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Solo Lending ·").first()).toBeVisible();
  // …and the "keep one admin" rule is visible in the UI (no self-deactivate button).
  await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
});
