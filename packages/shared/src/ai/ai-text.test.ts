import { describe, expect, it } from "vitest";

import { buildUserPrompt, docToAiText, SYSTEM_PROMPT } from "./analysis";

const t = (text: string) => ({ type: "text", text });
const p = (text: string) => ({ type: "paragraph", content: [t(text)] });
const task = (text: string, checked: boolean) => ({
  type: "taskItem",
  attrs: { checked },
  content: [p(text)],
});

describe("docToAiText", () => {
  it("keeps headings, bullets and whether each checklist item is done", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [t("Goals & timeline")] },
        p("First home buyers; want to settle before March 2027."),
        { type: "bulletList", content: [{ type: "listItem", content: [p("Deposit $170,000")] }] },
        { type: "heading", attrs: { level: 2 }, content: [t("Next steps")] },
        {
          type: "taskList",
          content: [task("Send fact find", true), task("Request 3 months of payslips", false)],
        },
      ],
    };
    expect(docToAiText(doc)).toBe(
      [
        "## Goals & timeline",
        "First home buyers; want to settle before March 2027.",
        "- Deposit $170,000",
        "## Next steps",
        "[x] Send fact find",
        "[ ] Request 3 months of payslips",
      ].join("\n"),
    );
  });

  it("renders tables as rows and skips empty paragraphs", () => {
    const doc = {
      type: "doc",
      content: [
        p(""),
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [p("Lender")] },
                { type: "tableHeader", content: [p("Rate")] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [p("ANZ")] },
                { type: "tableCell", content: [p("6.04%")] },
              ],
            },
          ],
        },
      ],
    };
    expect(docToAiText(doc)).toBe("| Lender | Rate |\n| ANZ | 6.04% |");
  });
});

describe("prompt context for dates", () => {
  it("lists what's already scheduled so it isn't suggested again", () => {
    const prompt = buildUserPrompt({
      title: "Discovery call",
      text: "x",
      noteType: "DISCOVERY",
      loanStage: "LEAD",
      today: "Sunday 2026-11-29",
      scheduled: { meeting: "2026-11-28 21:39", followUp: "2026-11-29" },
    });
    expect(prompt).toContain("Already scheduled: meeting 2026-11-28 21:39; follow-up 2026-11-29");
  });

  it("asks for month-level targets and ignores done checklist items", () => {
    expect(SYSTEM_PROMPT).toContain('"Before March 2027" → the day before (2027-02-28)');
    expect(SYSTEM_PROMPT).toContain('never list "[x]" items');
  });
});
