import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTemplateAction,
  removeTemplateAction,
  setFavouriteAction,
} from "./note-extras-actions";
import { saveNoteAction } from "./actions";

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
      return status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

describe("favourites and templates", () => {
  it("stars and unstars with PUT/DELETE", async () => {
    const calls = fakeFetch(204, null);
    await expect(setFavouriteAction("n1", true)).resolves.toEqual({ ok: true });
    await setFavouriteAction("n1", false);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "PUT /api/notes/n1/favourite",
      "DELETE /api/notes/n1/favourite",
    ]);
  });

  it("creates and removes templates, passing errors back", async () => {
    const calls = fakeFetch(201, { id: "t1", name: "ANZ call" });
    await expect(createTemplateAction({ noteId: "n1", name: "ANZ call" })).resolves.toMatchObject({
      ok: true,
      template: { id: "t1" },
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/templates" });
    fakeFetch(403, {
      statusCode: 403,
      message: "Case managers can use templates but not create them.",
    });
    await expect(createTemplateAction({ noteId: "n1", name: "x" })).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/Case managers/),
    });
    fakeFetch(204, null);
    await expect(removeTemplateAction("t1")).resolves.toEqual({ ok: true });
  });
});

describe("saveNoteAction", () => {
  const doc = { type: "doc" as const, content: [] };

  it("sends the base revision and returns the new one", async () => {
    const calls = fakeFetch(200, { updatedAt: "2026-11-28T00:00:00.000Z", revision: 4 });
    await expect(
      saveNoteAction({ id: "n1", title: "t", contentJson: doc, contentText: "", baseRevision: 3 }),
    ).resolves.toEqual({ ok: true, updatedAt: "2026-11-28T00:00:00.000Z", revision: 4 });
    expect(calls[0]?.body).toMatchObject({ baseRevision: 3 });
  });

  it("turns a 409 NOTE_CONFLICT into a conflict with the latest version", async () => {
    const latest = {
      revision: 5,
      title: "Theirs",
      contentJson: doc,
      updatedAt: "x",
      updatedBy: null,
    };
    fakeFetch(409, {
      statusCode: 409,
      message: "changed elsewhere",
      code: "NOTE_CONFLICT",
      latest,
    });
    await expect(
      saveNoteAction({ id: "n1", title: "t", contentJson: doc, contentText: "", baseRevision: 3 }),
    ).resolves.toEqual({ ok: false, error: "changed elsewhere", conflict: latest });

    fakeFetch(409, { statusCode: 409, message: "This note is finalised." });
    await expect(
      saveNoteAction({ id: "n1", title: "t", contentJson: doc, contentText: "" }),
    ).resolves.toEqual({ ok: false, error: "This note is finalised." });
  });
});
