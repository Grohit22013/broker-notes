import { OpenRouterClient } from "./openrouter.client";

const VALID = JSON.stringify({
  summary: "First home buyers in Parramatta.",
  actionItems: [{ text: "Request payslips", due: null }],
  keyFigures: {},
  bestInterests: { status: "ok", issues: [] },
  dates: [],
});

type Sent = { model: string; models: string[]; max_tokens: number };

/** Fake OpenRouter: answers each request with the next canned reply, recording what was sent. */
function fakeOpenRouter(replies: object[]) {
  const sent: Sent[] = [];
  global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent);
    const reply = replies.shift() ?? {};
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as unknown as typeof fetch;
  return sent;
}

describe("OpenRouterClient", () => {
  const env = process.env;
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env = { ...env, OPENROUTER_API_KEY: "test-key", AI_PROVIDER: "", OPENROUTER_MODEL: "" };
  });
  afterEach(() => {
    process.env = env;
    global.fetch = realFetch;
  });

  it("falls back to the next free model when a reasoning model runs out of room", async () => {
    const sent = fakeOpenRouter([
      {
        model: "nvidia/nemotron-3.5-super-vl:free",
        choices: [{ finish_reason: "length", message: { content: null } }],
      },
      {
        model: "google/gemma-4-31b-it:free",
        choices: [{ finish_reason: "stop", message: { content: VALID } }],
      },
    ]);
    const res = await new OpenRouterClient().analyse("Note text");
    expect(res).toMatchObject({ ok: true, model: "google/gemma-4-31b-it:free" });
    expect(sent).toHaveLength(2);
    expect(sent[0]!.model).toBe("nvidia/nemotron-3.5-super-vl:free");
    // The retry skips the model that ran out of room, and stays on free models only.
    expect(sent[1]!.models).not.toContain("nvidia/nemotron-3.5-super-vl:free");
    expect(sent.flatMap((s) => s.models).every((m) => m.endsWith(":free"))).toBe(true);
    expect(sent[0]!.max_tokens).toBe(8000);
  });

  it("reports a clear error if every model runs out of room", async () => {
    const outOfRoom = { choices: [{ finish_reason: "length", message: { content: "" } }] };
    fakeOpenRouter([outOfRoom, outOfRoom]);
    const res = await new OpenRouterClient().analyse("Note text");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/ran out of room/) });
  });

  it("doesn't retry other failures as 'out of room'", async () => {
    const sent = fakeOpenRouter([
      { choices: [{ finish_reason: "stop", message: { content: VALID } }] },
    ]);
    const res = await new OpenRouterClient().analyse("Note text");
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(1);
  });
});
