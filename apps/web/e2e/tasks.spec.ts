import { expect, test } from "@playwright/test";

import { register, uniqueEmail } from "./helpers";

/** Phase 10: checklist → tasks → complete → add → Tasks page filters → dashboard. */
test("turn a note's checklist into tasks and work through them", async ({ page }) => {
  test.slow();
  await register(page, "Task Broker", uniqueEmail("tasks"));

  // A discovery-call note has an unticked "Next steps" checklist.
  await page.goto("/notes/new");
  await page.getByRole("button", { name: "Create note from template: Discovery call" }).click();
  await expect(page).toHaveURL(/\/notes\/[a-z0-9]{20,}$/);
  const noteUrl = page.url();

  // Open the Tasks panel (retried: a click before hydration does nothing).
  const panel = page.getByRole("dialog", { name: "Follow-up tasks" });
  await expect(async () => {
    await page.getByRole("button", { name: "Tasks (0 open)" }).click();
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  await panel.getByRole("button", { name: "From checklist" }).click();
  await expect(page.getByText("Created 2 tasks from the checklist")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Send fact find" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Request ID and payslips" })).toBeVisible();

  // Tick one off.
  await panel.getByRole("checkbox", { name: "Mark “Send fact find” as done" }).check();
  await expect(page.getByText("Done: Send fact find")).toBeVisible();

  // Running it again doesn't duplicate tasks.
  await panel.getByRole("button", { name: "From checklist" }).click();
  await expect(page.getByText("No new unticked checklist items")).toBeVisible();

  // Add one by hand, already overdue.
  await panel.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill("Chase gift letter");
  await form.getByLabel("Due date").fill("2026-01-05");
  await form.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Task “Chase gift letter” added")).toBeVisible();

  // The Tasks page shows my open tasks; done ones are filed separately.
  await page.goto("/tasks");
  const list = page.getByRole("list", { name: "Tasks" });
  await expect(list.getByRole("button", { name: "Request ID and payslips" })).toBeVisible();
  await expect(list.getByRole("button", { name: "Chase gift letter" })).toBeVisible();
  await expect(list.getByRole("button", { name: "Send fact find" })).toHaveCount(0);
  await expect(list.getByText(/^Overdue/)).toBeVisible();

  await page.getByRole("link", { name: "Overdue" }).click();
  // Server-rendered filter pages hit the (remote) database: allow time for navigation.
  await expect(page).toHaveURL(/due=overdue/, { timeout: 15_000 });
  await expect(list.getByRole("listitem")).toHaveCount(1, { timeout: 15_000 });

  await page.getByRole("link", { name: "Done & cancelled" }).click();
  await expect(page).toHaveURL(/view=done/, { timeout: 15_000 });
  await expect(list.getByRole("button", { name: "Send fact find" })).toBeVisible();

  // Each task links back to its note.
  await expect(list.getByRole("link", { name: "Discovery call" })).toHaveAttribute(
    "href",
    new URL(noteUrl).pathname,
  );

  // The dashboard counts them.
  await page.goto("/dashboard");
  const stat = page.getByRole("link", { name: /My tasks.*overdue/ });
  await expect(stat).toContainText("2");
  await expect(stat).toContainText("1 overdue");
});
