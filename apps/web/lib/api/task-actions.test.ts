import { afterEach, describe, expect, it, vi } from "vitest";

import { batchTasksAction, createTaskAction, loadTasks, updateTaskAction } from "./task-actions";

afterEach(() => vi.unstubAllGlobals());

function fakeFetch(status: number, body: unknown) {
  const calls: { method?: string; url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

describe("task actions", () => {
  it("create, update and batch hit the right endpoints and return the task", async () => {
    const calls = fakeFetch(200, { id: "t1", title: "Chase payslips" });
    await expect(createTaskAction({ title: "Chase payslips", noteId: "n1" })).resolves.toEqual({
      ok: true,
      task: { id: "t1", title: "Chase payslips" },
    });
    await updateTaskAction("t/1", { status: "COMPLETED" });
    expect(calls).toEqual([
      { method: "POST", url: "/api/tasks", body: { title: "Chase payslips", noteId: "n1" } },
      { method: "PATCH", url: "/api/tasks/t%2F1", body: { status: "COMPLETED" } },
    ]);

    fakeFetch(201, { created: 2, tasks: [] });
    await expect(batchTasksAction({ noteId: "n1", titles: ["a", "b"] })).resolves.toEqual({
      ok: true,
      created: 2,
    });
  });

  it("passes errors (with their field) back to the form", async () => {
    fakeFetch(403, { statusCode: 403, message: "Only the task's creator…" });
    await expect(updateTaskAction("t1", { status: "CANCELLED" })).resolves.toEqual({
      ok: false,
      error: "Only the task's creator…",
    });
    fakeFetch(400, { statusCode: 400, message: "Give the task a title", field: "title" });
    await expect(createTaskAction({ title: "" })).resolves.toEqual({
      ok: false,
      error: "Give the task a title",
      field: "title",
    });
    fakeFetch(404, { statusCode: 404, message: "Note not found" });
    await expect(batchTasksAction({ noteId: "x", titles: ["a"] })).resolves.toEqual({
      ok: false,
      error: "Note not found",
    });
  });

  it("loads a filtered list, or null on failure", async () => {
    const calls = fakeFetch(200, [{ id: "t1" }]);
    await expect(loadTasks({ note: "n1", status: "all" })).resolves.toEqual([{ id: "t1" }]);
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/tasks?note=n1&status=all" });
    fakeFetch(500, { message: "boom" });
    await expect(loadTasks({})).resolves.toBeNull();
  });
});
