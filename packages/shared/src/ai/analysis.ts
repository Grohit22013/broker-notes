import { z } from "zod";

import { parseIsoDate } from "../dates";
import { parseMoney, parseRate } from "../money";
import type { KeyFigures } from "../notes/figures";

import { AI_MAX_INPUT_CHARS } from "./config";

/**
 * Prompt + response handling for the single "Analyse note" call. One request returns everything
 * (summary, action items, key figures, Best Interests check, dates) — separate calls would cost
 * several times as much free-tier quota for the same result.
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
  },
  "dates": [                         // dates the note mentions that the broker should act on, max 6
    {
      "kind": "meeting" | "follow_up" | "deadline",   // meeting = an appointment with the client/lender; follow_up = when to call back or check in; deadline = something due (documents, conditions, settlement)
      "date": string,                // YYYY-MM-DD, resolved using "Today" below (e.g. "next Tuesday")
      "time": string | null,         // HH:mm 24-hour if stated, else null
      "label": string                // short, e.g. "Call Asha re payslips", "Valuation report due"
    }
  ]
}

Rules:
- Use only information in the note. Never invent figures, names or dates; use null when unknown.
- Amounts like "$850k" or "1.2m" become numbers (850000, 1200000).
- For bestInterests, check whether the note records: the client's requirements and objectives, the options/lenders considered and compared (costs, rates, fees), why the recommended product suits the client, and why cheaper or alternative options were not recommended. Flag generic boilerplate. If the note is not about a recommendation (e.g. a first discovery call), say what will need to be recorded later and use "needs_attention" only if something important is missing for its stage.
- For dates: only include dates the note actually states or clearly implies ("next Tuesday", "end of the month", "in two weeks"); resolve them against Today; never guess. Past dates that are only history (e.g. "settled 14 Nov") are not actions — leave them out. Use [] when there are none.
- Text like "[TFN removed]" marks redacted personal identifiers — ignore them.
- Write in Australian English.`;

export function buildUserPrompt({
  title,
  text,
  noteType,
  loanStage,
  today,
}: {
  title: string;
  text: string;
  noteType: string;
  loanStage: string | null;
  /** The broker's current date, e.g. "Saturday 2026-11-28" — lets the model resolve "next Tuesday". */
  today?: string;
}): string {
  const body =
    text.length > AI_MAX_INPUT_CHARS ? `${text.slice(0, AI_MAX_INPUT_CHARS)}\n[…truncated]` : text;
  return [
    ...(today ? [`Today: ${today} (Australia/Sydney)`] : []),
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
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && parseIsoDate(v) ? v : null));

const hhmm = z
  .string()
  .nullable()
  .optional()
  .transform((v) => {
    const m = v ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    return `${m[1]!.padStart(2, "0")}:${m[2]}`;
  });

export const DATE_KINDS = ["meeting", "follow_up", "deadline"] as const;
export type SpottedDateKind = (typeof DATE_KINDS)[number];

/** One date the AI found in the note text (kept only if it's a real calendar date). */
const spottedDate = z.object({
  kind: z.enum(DATE_KINDS).catch("deadline"),
  date: isoDate,
  time: hhmm,
  label: z.string().trim().min(1).max(200).catch("Date mentioned in the note"),
});

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
  // Analyses saved before this field existed still parse (as "no dates found").
  dates: z
    .array(z.unknown())
    .max(30)
    .catch([])
    .default([])
    .transform((items) =>
      items
        .map((i) => spottedDate.safeParse(i))
        .flatMap((r) => (r.success && r.data.date ? [{ ...r.data, date: r.data.date }] : []))
        .slice(0, 6),
    ),
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
