import { z } from "zod";

import { parseMoney, parseRate } from "../money";
import type { KeyFigures } from "../notes/figures";

import { AI_MAX_INPUT_CHARS } from "./config";

/**
 * Prompt + response handling for the single "Analyse note" call. One request returns everything
 * (summary, action items, key figures, Best Interests check) — four separate calls would cost
 * four times as much free-tier quota for the same result.
 */

export const SYSTEM_PROMPT = `You are an assistant for an Australian mortgage broker. You read one client file note and return ONLY a JSON object (no markdown, no commentary) with exactly these keys:

{
  "summary": string,            // 2–4 sentences, factual, third person, suitable as a compliance file-note summary
  "actionItems": [ { "text": string, "due": string | null } ],   // concrete next steps from the note; "due" only if a date is stated (YYYY-MM-DD), else null; max 8
  "keyFigures": {
    "loanAmount": number | null,     // AUD, whole dollars
    "propertyValue": number | null,  // AUD
    "income": number | null,         // household gross annual income, AUD
    "rate": number | null,           // interest rate, % p.a., e.g. 6.04
    "lender": string | null          // e.g. "ANZ"
  },
  "bestInterests": {
    "status": "ok" | "needs_attention",
    "issues": [ string ]             // gaps against ASIC RG 273 Best Interests Duty, max 5
  }
}

Rules:
- Use only information in the note. Never invent figures, names or dates; use null when unknown.
- Amounts like "$850k" or "1.2m" become numbers (850000, 1200000).
- For bestInterests, check whether the note records: the client's requirements and objectives, the options/lenders considered and compared (costs, rates, fees), why the recommended product suits the client, and why cheaper or alternative options were not recommended. Flag generic boilerplate. If the note is not about a recommendation (e.g. a first discovery call), say what will need to be recorded later and use "needs_attention" only if something important is missing for its stage.
- Text like "[TFN removed]" marks redacted personal identifiers — ignore them.
- Write in Australian English.`;

export function buildUserPrompt({
  title,
  text,
  noteType,
  loanStage,
}: {
  title: string;
  text: string;
  noteType: string;
  loanStage: string | null;
}): string {
  const body =
    text.length > AI_MAX_INPUT_CHARS ? `${text.slice(0, AI_MAX_INPUT_CHARS)}\n[…truncated]` : text;
  return [
    `Note title: ${title || "(untitled)"}`,
    `Note type: ${noteType}`,
    `Loan stage: ${loanStage ?? "not set"}`,
    "",
    "Note text:",
    '"""',
    body,
    '"""',
  ].join("\n");
}

// ── Response parsing ──────────────────────────────────────────────────────────

/** Accepts numbers or strings like "$850,000", "850k", "6.04%". */
const money = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => (typeof v === "number" ? (v >= 0 ? v : null) : v ? parseMoney(v) : null));
const rate = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) =>
    typeof v === "number" ? (v >= 0 && v <= 30 ? v : null) : v ? parseRate(v) : null,
  );

const isoDate = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

export const analysisSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  actionItems: z
    .array(
      z.union([
        z.object({ text: z.string().trim().min(1).max(300), due: isoDate }),
        z
          .string()
          .trim()
          .min(1)
          .max(300)
          .transform((text) => ({ text, due: null })),
      ]),
    )
    .max(20)
    .default([])
    .transform((items) => items.slice(0, 8)),
  keyFigures: z
    .object({
      loanAmount: money,
      propertyValue: money,
      income: money,
      rate,
      lender: z
        .string()
        .trim()
        .max(60)
        .nullable()
        .optional()
        .transform((v) => v || null),
    })
    .prefault({}),
  bestInterests: z
    .object({
      status: z.enum(["ok", "needs_attention"]).catch("needs_attention"),
      issues: z
        .array(z.string().trim().min(1).max(400))
        .default([])
        .transform((i) => i.slice(0, 5)),
    })
    .default({ status: "needs_attention", issues: [] }),
});

export type Analysis = z.output<typeof analysisSchema>;

/** Key figures in the shape the note stores (drops nulls). */
export function suggestedFigures(a: Analysis): KeyFigures {
  const out: KeyFigures = {};
  const k = a.keyFigures;
  if (k.loanAmount !== null && k.loanAmount !== undefined) out.loanAmount = k.loanAmount;
  if (k.propertyValue !== null && k.propertyValue !== undefined)
    out.propertyValue = k.propertyValue;
  if (k.income !== null && k.income !== undefined) out.income = k.income;
  if (k.rate !== null && k.rate !== undefined) out.rate = k.rate;
  if (k.lender) out.lender = k.lender;
  return out;
}

/**
 * Pulls the JSON object out of a model reply — tolerant of ```json fences or prose around it,
 * which free models sometimes add despite instructions.
 */
export function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1];
  const candidate = fenced ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

export function parseAnalysis(
  raw: string,
): { ok: true; analysis: Analysis } | { ok: false; error: string } {
  try {
    const parsed = analysisSchema.safeParse(extractJson(raw));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Unexpected response shape" };
    }
    return { ok: true, analysis: parsed.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

/** Stable hash input: re-analysing an unchanged note reuses the cached result. */
export function analysisInput(
  title: string,
  text: string,
  noteType: string,
  loanStage: string | null,
) {
  return JSON.stringify([title.trim(), text.trim(), noteType, loanStage]);
}
