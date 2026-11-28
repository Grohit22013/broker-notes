/**
 * AI provider configuration. BrokerNotes only ever uses **free** OpenRouter models
 * (ids ending in ":free") — a paid model id in the environment is ignored, never used.
 */

/**
 * Free models that support JSON output, in preference order (probed Nov 2026: the Gemma free
 * endpoints were often rate-limited upstream, Nemotron answered reliably).
 */
export const DEFAULT_FREE_MODELS = [
  // Reasoning model; reliable on the free tier and supports structured output.
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
] as const;

export const AI_DAILY_LIMIT = 20;
export const AI_MAX_INPUT_CHARS = 12_000;
export const AI_TIMEOUT_MS = 45_000;

export type AiProvider = "openrouter" | "mock" | "disabled";

export type AiConfig = {
  provider: AiProvider;
  apiKey: string | null;
  /** Primary first; OpenRouter falls back through the rest. All end in ":free". */
  models: string[];
  /** Ids from OPENROUTER_MODEL that were rejected because they aren't free. */
  rejected: string[];
};

export const isFreeModel = (id: string) => /^[\w.-]+\/[\w.:-]+:free$/.test(id.trim());

/**
 * Reads config from env. `OPENROUTER_MODEL` may list several comma-separated ids; anything that
 * isn't a `:free` model is dropped. `AI_PROVIDER=mock` gives deterministic output for E2E tests.
 */
export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const requested = (env.OPENROUTER_MODEL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const free = requested.filter(isFreeModel);
  const rejected = requested.filter((m) => !isFreeModel(m));
  const models = [...new Set([...free, ...DEFAULT_FREE_MODELS])].slice(0, 3);

  if (env.AI_PROVIDER === "mock") return { provider: "mock", apiKey: null, models, rejected };
  const apiKey = env.OPENROUTER_API_KEY?.trim() || null;
  return { provider: apiKey ? "openrouter" : "disabled", apiKey, models, rejected };
}
