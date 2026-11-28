import { describe, expect, it } from "vitest";

import { canChangeTask } from "../orgs/roles";

import { openChecklistItems } from "./from-doc";
import { isOpenTask, TASK_BATCH_MAX } from "./taxonomy";
import {
  batchTasksSchema,
  createTaskSchema,
  taskFiltersSchema,
  updateTaskSchema,
} from "./validation";

const ID = "cmwzdoxp20000e9249ao6x6jh";
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const item = (text: string, checked = false, nested?: object) => ({
  type: "taskItem",
  attrs: { checked },
  content: [p(text), ...(nested ? [nested] : [])],
});

describe("openChecklistItems", () => {
  it("returns unticked items in order, trimmed and de-duplicated", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Next steps" }] },
        {
          type: "taskList",
          content: [
            item("  Send fact   find "),
            item("Order valuation", true),
            item("Request 3 payslips", false, {
              type: "taskList",
              content: [item("From both applicants")],
            }),
            item("send FACT find"),
            item("   "),
          ],
        },
      ],
    };
    expect(openChecklistItems(doc)).toEqual([
      "Send fact find",
      "Request 3 payslips",
      "From both applicants",
    ]);
  });

  it("caps the number of items and their length", () => {
    const many = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: Array.from({ length: 30 }, (_, i) => item(`Item ${i} ${"x".repeat(250)}`)),
        },
      ],
    };
    const out = openChecklistItems(many);
    expect(out).toHaveLength(TASK_BATCH_MAX);
    expect(out.every((t) => t.length <= 200)).toBe(true);
    expect(openChecklistItems({ type: "doc", content: [p("No checklist")] })).toEqual([]);
  });
});

describe("task validation", () => {
  it("creates with defaults and normalises empty links", () => {
    expect(
      createTaskSchema.parse({ title: "  Chase payslips ", assigneeId: "", caseId: ID }),
    ).toMatchObject({ title: "Chase payslips", priority: "MEDIUM", assigneeId: null, caseId: ID });
    expect(createTaskSchema.safeParse({ title: " " }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "x", dueDate: "2026-02-30" }).success).toBe(false);
  });

  it("updates status/priority but never moves links", () => {
    expect(updateTaskSchema.parse({ status: "COMPLETED", noteId: ID })).toEqual({
      status: "COMPLETED",
    });
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });

  it("limits batches", () => {
    const titles = Array.from({ length: TASK_BATCH_MAX + 1 }, (_, i) => `t${i}`);
    expect(batchTasksSchema.safeParse({ noteId: ID, titles }).success).toBe(false);
    expect(batchTasksSchema.safeParse({ noteId: ID, titles: [] }).success).toBe(false);
  });

  it("reads list filters leniently", () => {
    expect(taskFiltersSchema.parse({})).toEqual({ status: "open", q: "" });
    expect(taskFiltersSchema.parse({ status: "x", due: "soon", case: "bad" })).toEqual({
      status: "open",
      q: "",
    });
  });
});

describe("task rules", () => {
  const task = { createdById: "c", assigneeId: "a" };
  it("lets the creator, the assignee or an admin change a task", () => {
    expect(canChangeTask({ id: "c", role: "CASE_MANAGER" }, task)).toBe(true);
    expect(canChangeTask({ id: "a", role: "ADVISER" }, task)).toBe(true);
    expect(canChangeTask({ id: "z", role: "ADMIN" }, task)).toBe(true);
    expect(canChangeTask({ id: "z", role: "ADVISER" }, task)).toBe(false);
  });

  it("knows which statuses are open", () => {
    expect(isOpenTask("IN_PROGRESS")).toBe(true);
    expect(isOpenTask("CANCELLED")).toBe(false);
  });
});
