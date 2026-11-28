import { Injectable, Logger } from "@nestjs/common";
import { parseAnalysis, SYSTEM_PROMPT, type Analysis } from "@broker-notes/shared/ai/analysis";
import {
  AI_TIMEOUT_MS,
  getAiConfig,
  isFreeModel,
  type AiConfig,
} from "@broker-notes/shared/ai/config";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type AiResult =
  | { ok: true; analysis: Analysis; model: string }
  | { ok: false; error: string; retryable: boolean };

type Message = { role: "system" | "user" | "assistant"; content: string };
type CallResult =
  | { ok: true; content: string; model: string }
  | {
      ok: false;
      error: string;
      retryable: boolean;
      /** The model spent its whole token budget (usually on reasoning) without answering. */
      outOfRoom?: boolean;
    };

/**
 * OpenRouter chat client — **free models only**. One request per analysis, with OpenRouter routing
 * across up to three ":free" fallbacks; if the reply isn't valid JSON we ask once to fix it.
 * Only already-redacted text may be passed in.
 */
@Injectable()
export class OpenRouterClient {
  private readonly logger = new Logger(OpenRouterClient.name);

  config(): AiConfig {
    const config = getAiConfig();
    if (config.rejected.length) {
      this.logger.warn(`Ignoring non-free model id(s): ${config.rejected.join(", ")}`);
    }
    return config;
  }

  async analyse(userPrompt: string): Promise<AiResult> {
    const config = this.config();
    if (config.provider === "disabled") {
      return { ok: false, error: "AI isn't configured on this server.", retryable: false };
    }
    if (config.provider === "mock") return mockAnalysis(userPrompt);

    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];
    let first = await this.call(messages, config);
    // A reasoning model can "think" past its budget and return nothing. OpenRouter only falls back
    // on provider errors, so try the next free model ourselves (they don't think first).
    if (!first.ok && first.outOfRoom && config.models.length > 1) {
      this.logger.warn("AI ran out of room; retrying with the next free model");
      first = await this.call(messages, { ...config, models: config.models.slice(1) });
    }
    if (!first.ok) return first;
    const parsed = parseAnalysis(first.content);
    if (parsed.ok) return { ok: true, analysis: parsed.analysis, model: first.model };

    this.logger.warn(`Unparseable AI reply (${parsed.error}); asking the model to repair it`);
    const second = await this.call(
      [
        ...messages,
        { role: "assistant", content: first.content.slice(0, 4000) },
        {
          role: "user",
          content: `That was not valid JSON for the required shape (${parsed.error}). Reply with ONLY the corrected JSON object.`,
        },
      ],
      config,
    );
    if (!second.ok) return second;
    const reparsed = parseAnalysis(second.content);
    if (reparsed.ok) return { ok: true, analysis: reparsed.analysis, model: second.model };
    return {
      ok: false,
      error: "The AI returned an unexpected format. Please try again.",
      retryable: true,
    };
  }

  private async call(messages: Message[], config: AiConfig): Promise<CallResult> {
    // Defence in depth: never send a request that could be billed.
    const models = config.models.filter(isFreeModel);
    if (!config.apiKey || models.length === 0) {
      return { ok: false, error: "No free AI model is configured.", retryable: false };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          // App attribution header OpenRouter recommends; generic — no user data.
          "X-Title": "BrokerNotes",
        },
        body: JSON.stringify({
          model: models[0],
          models, // OpenRouter falls back through these (all free) if one is busy or down
          messages,
          response_format: { type: "json_object" },
          temperature: 0.2,
          // Reasoning models "think" before answering: leave room for the JSON, keep thinking short,
          // and don't send the reasoning text back.
          max_tokens: 8000,
          reasoning: { effort: "low", exclude: true },
        }),
      });

      if (res.status === 429) {
        return {
          ok: false,
          error: "The free AI model is busy (rate limit). Please try again in a minute.",
          retryable: true,
        };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "The AI service rejected the API key.", retryable: false };
      }
      if (res.status === 402) {
        // Should never happen with :free models — refuse rather than risk charges.
        return {
          ok: false,
          error: "The AI service asked for payment; BrokerNotes only uses free models.",
          retryable: false,
        };
      }
      if (!res.ok) {
        this.logger.warn(`OpenRouter responded ${res.status}`);
        return {
          ok: false,
          error: `The AI service is unavailable (${res.status}).`,
          retryable: true,
        };
      }

      const data = (await res.json()) as {
        model?: string;
        choices?: { finish_reason?: string; message?: { content?: string | null } }[];
        error?: { message?: string };
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content && data.choices?.[0]?.finish_reason === "length") {
        return {
          ok: false,
          error: "The AI ran out of room before answering. Please try again.",
          retryable: true,
          outOfRoom: true,
        };
      }
      if (!content) {
        return {
          ok: false,
          error: data.error?.message ?? "The AI returned an empty reply.",
          retryable: true,
        };
      }
      const used = data.model && isFreeModel(data.model) ? data.model : models[0]!;
      return { ok: true, content, model: used };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        error: aborted
          ? "The AI took too long to respond. Please try again."
          : "Couldn't reach the AI service.",
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Deterministic provider for tests (AI_PROVIDER=mock): no network, no quota.
 * Echoes a slice of the (redacted) input so tests can prove redaction happened before "sending".
 */
function mockAnalysis(userPrompt: string): AiResult {
  const body = userPrompt.split('"""')[1]?.trim() ?? "";
  const excerpt = body.replace(/\s+/g, " ").slice(0, 160);
  return {
    ok: true,
    model: "mock/test-model:free",
    analysis: {
      summary: `MOCK SUMMARY. Input seen: ${excerpt}`,
      actionItems: [
        { text: "Request 3 months of payslips", due: null },
        { text: "Order valuation", due: "2026-12-05" },
      ],
      keyFigures: {
        loanAmount: 680000,
        propertyValue: 850000,
        income: 182000,
        rate: 6.04,
        lender: "ANZ",
      },
      bestInterests: {
        status: "needs_attention",
        issues: ["No comparison of alternative lenders is recorded."],
      },
      dates: mockDates(userPrompt),
    },
  };
}

function mockDates(userPrompt: string) {
  const today = /^Today: \S+ (\d{4})-(\d{2})-(\d{2})/m.exec(userPrompt);
  if (!today) return [];
  const t = new Date(Date.UTC(Number(today[1]), Number(today[2]) - 1, Number(today[3]) + 3));
  const date = t.toISOString().slice(0, 10);
  return [
    { kind: "follow_up" as const, date, time: null, label: "Call back about payslips (mock)" },
    { kind: "meeting" as const, date, time: "10:30", label: "Meet the ANZ BDM (mock)" },
  ];
}
