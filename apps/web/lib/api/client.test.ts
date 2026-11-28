import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./client";

afterEach(() => vi.unstubAllGlobals());

/** Fake fetch whose responses resolve after the given delays (ms), in call order. */
function slowFetch(delays: number[]) {
  const order: string[] = [];
  let call = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const delay = delays[call++] ?? 0;
    order.push(`start ${init?.method} ${url}`);
    await new Promise((r) => setTimeout(r, delay));
    order.push(`end ${init?.method} ${url}`);
    return new Response(JSON.stringify({ url }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return order;
}

describe("api client", () => {
  it("runs mutations strictly in order, even when the first is slower", async () => {
    const order = slowFetch([60, 5]);
    await Promise.all([api("PATCH", "/a", {}), api("PATCH", "/b", {})]);
    expect(order).toEqual([
      "start PATCH /api/a",
      "end PATCH /api/a",
      "start PATCH /api/b",
      "end PATCH /api/b",
    ]);
  });

  it("lets reads run in parallel", async () => {
    const order = slowFetch([40, 5]);
    await Promise.all([api("GET", "/a"), api("GET", "/b")]);
    expect(order.slice(0, 2)).toEqual(["start GET /api/a", "start GET /api/b"]);
  });

  it("keeps the queue going after a failed request", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (n++ === 0) throw new TypeError("network down");
        return new Response(JSON.stringify({ ok: 1 }), { status: 200 });
      }),
    );
    const [first, second] = await Promise.all([api("POST", "/x", {}), api("POST", "/y", {})]);
    expect(first).toMatchObject({ ok: false, status: 0 });
    expect(second).toMatchObject({ ok: true });
  });

  it("maps API error bodies to { ok: false, error, field }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ statusCode: 409, message: "Taken", field: "email" }), {
            status: 409,
          }),
      ),
    );
    await expect(api("POST", "/clients", {})).resolves.toEqual({
      ok: false,
      status: 409,
      error: "Taken",
      field: "email",
    });
  });
});
