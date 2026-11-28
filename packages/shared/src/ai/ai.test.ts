import { describe, expect, it } from "vitest";

import {
  analysisInput,
  buildUserPrompt,
  extractJson,
  parseAnalysis,
  suggestedFigures,
} from "./analysis";
import { AI_MAX_INPUT_CHARS, DEFAULT_FREE_MODELS, getAiConfig, isFreeModel } from "./config";
import { luhnValid, medicareValid, redact, tfnValid } from "./redact";

describe("free-model config", () => {
  it("only ever uses :free models", () => {
    for (const m of DEFAULT_FREE_MODELS) expect(isFreeModel(m)).toBe(true);
    expect(isFreeModel("openai/gpt-5")).toBe(false);
    expect(isFreeModel("anthropic/claude-opus-5-5")).toBe(false);
    expect(isFreeModel("google/gemma-4-31b-it:free")).toBe(true);
  });

  it("drops paid model ids from OPENROUTER_MODEL and keeps free fallbacks", () => {
    const c = getAiConfig({
      OPENROUTER_API_KEY: "sk-or-test",
      OPENROUTER_MODEL: "openai/gpt-5, liquid/lfm-3-1.7b:free",
    });
    expect(c.provider).toBe("openrouter");
    expect(c.rejected).toEqual(["openai/gpt-5"]);
    expect(c.models[0]).toBe("liquid/lfm-3-1.7b:free");
    expect(c.models.every(isFreeModel)).toBe(true);
    expect(c.models).toHaveLength(3);
  });

  it("is disabled without a key, and mock when asked", () => {
    expect(getAiConfig({}).provider).toBe("disabled");
    expect(getAiConfig({ AI_PROVIDER: "mock" }).provider).toBe("mock");
  });
});

describe("checksums", () => {
  it("validates TFN, Medicare and card numbers", () => {
    expect(tfnValid("123456782")).toBe(true); // ATO-published test TFN
    expect(tfnValid("123456789")).toBe(false);
    expect(medicareValid("2123456701")).toBe(true);
    expect(medicareValid("2123456711")).toBe(false);
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
  });
});

describe("redact", () => {
  it("removes TFN, Medicare, card, bank, phone and email", () => {
    const input = [
      "TFN 123 456 782, Medicare 2123 45670 1.",
      "Card 4111 1111 1111 1111 on file.",
      "Salary into BSB 062-000 acc 12345678.",
      "Call 0412 345 678 or (02) 9876 5432, email asha.patel@example.com.",
    ].join("\n");
    const { text, counts, total } = redact(input);
    expect(text).not.toMatch(/123 456 782|2123 45670|4111|12345678|0412|9876|asha\.patel/);
    expect(text).toContain("[TFN removed]");
    expect(text).toContain("[Medicare no. removed]");
    expect(text).toContain("[card no. removed]");
    expect(text).toContain("[bank account removed]");
    expect(text).toContain("[phone removed]");
    expect(text).toContain("[email removed]");
    expect(counts).toEqual({ tfn: 1, medicare: 1, card: 1, bank: 1, phone: 2, email: 1 });
    expect(total).toBe(7);
  });

  it("removes anything explicitly labelled TFN even if the checksum fails", () => {
    expect(redact("TFN: 987654321").text).toBe("[TFN removed]");
  });

  it("keeps loan figures, rates, dates and ordinary numbers", () => {
    const input =
      "Loan $680,000 on a $850,000 property (80% LVR) at 6.04%. Settle 14/03/2027. Income 182000.";
    expect(redact(input)).toEqual({
      text: input,
      counts: { tfn: 0, medicare: 0, card: 0, bank: 0, phone: 0, email: 0 },
      total: 0,
    });
  });

  it("does not treat a random 9-digit number as a TFN without a valid checksum", () => {
    expect(redact("Reference 123 456 789").text).toBe("Reference 123 456 789");
  });
});

describe("prompt", () => {
  it("includes the context and truncates very long notes", () => {
    const p = buildUserPrompt({
      title: "Fact find",
      text: "x".repeat(AI_MAX_INPUT_CHARS + 50),
      noteType: "FACT_FIND",
      loanStage: null,
    });
    expect(p).toContain("Note type: FACT_FIND");
    expect(p).toContain("Loan stage: not set");
    expect(p).toContain("[…truncated]");
    expect(p.length).toBeLessThan(AI_MAX_INPUT_CHARS + 300);
  });

  it("hash input changes when content or details change", () => {
    const a = analysisInput("T", "body", "GENERAL", null);
    expect(analysisInput(" T ", "body ", "GENERAL", null)).toBe(a);
    expect(analysisInput("T", "body!", "GENERAL", null)).not.toBe(a);
    expect(analysisInput("T", "body", "REVIEW", null)).not.toBe(a);
  });
});

describe("parseAnalysis", () => {
  const good = {
    summary: "First home buyers seeking $680k.",
    actionItems: [{ text: "Request payslips", due: "2026-12-03" }, "Send fact find"],
    keyFigures: {
      loanAmount: "$680k",
      propertyValue: 850000,
      income: "182,000",
      rate: "6.04%",
      lender: "ANZ",
    },
    bestInterests: { status: "needs_attention", issues: ["No lender comparison recorded"] },
  };

  it("parses clean JSON and normalises money/rates/strings", () => {
    const r = parseAnalysis(JSON.stringify(good));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.analysis.actionItems).toEqual([
      { text: "Request payslips", due: "2026-12-03" },
      { text: "Send fact find", due: null },
    ]);
    expect(suggestedFigures(r.analysis)).toEqual({
      loanAmount: 680000,
      propertyValue: 850000,
      income: 182000,
      rate: 6.04,
      lender: "ANZ",
    });
  });

  it("tolerates code fences and prose around the JSON", () => {
    const raw = "Sure! Here it is:\n```json\n" + JSON.stringify(good) + "\n```\nHope that helps.";
    expect(parseAnalysis(raw).ok).toBe(true);
    expect(extractJson(`noise ${JSON.stringify({ a: 1 })} noise`)).toEqual({ a: 1 });
  });

  it("fills safe defaults for missing optional sections and bad values", () => {
    const r = parseAnalysis(
      JSON.stringify({
        summary: "Short.",
        keyFigures: { loanAmount: -5, rate: 99, lender: "" },
        bestInterests: { status: "maybe" },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.analysis.actionItems).toEqual([]);
    expect(suggestedFigures(r.analysis)).toEqual({});
    expect(r.analysis.bestInterests).toEqual({ status: "needs_attention", issues: [] });
  });

  it("rejects responses without JSON or without a summary", () => {
    expect(parseAnalysis("I can't help with that.")).toMatchObject({ ok: false });
    expect(parseAnalysis(JSON.stringify({ actionItems: [] }))).toMatchObject({ ok: false });
  });

  it("caps action items and issues", () => {
    const r = parseAnalysis(
      JSON.stringify({
        summary: "S",
        actionItems: Array.from({ length: 15 }, (_, i) => `Task ${i}`),
        bestInterests: { status: "ok", issues: Array.from({ length: 9 }, (_, i) => `I${i}`) },
      }),
    );
    expect(r.ok && r.analysis.actionItems.length).toBe(8);
    expect(r.ok && r.analysis.bestInterests.issues.length).toBe(5);
  });
});
