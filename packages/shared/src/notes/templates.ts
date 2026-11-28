import type { JSONContent } from "./json-content";

import { EMPTY_DOC, type DocJson } from "./content";
import type { NoteTypeValue } from "./taxonomy";

/**
 * Broker note templates. Headings mirror what a compliant Australian file note needs to show
 * (ASIC RG 273 Best Interests Duty): the client's requirements and objectives, what was
 * compared, why the recommended product suits, and what happens next.
 */

const text = (t: string): JSONContent => ({ type: "text", text: t });
const h2 = (t: string): JSONContent => ({
  type: "heading",
  attrs: { level: 2 },
  content: [text(t)],
});
const p = (t?: string): JSONContent =>
  t ? { type: "paragraph", content: [text(t)] } : { type: "paragraph" };
const bullets = (items: string[]): JSONContent => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [p(i)] })),
});
const tasks = (items: string[]): JSONContent => ({
  type: "taskList",
  content: items.map((i) => ({ type: "taskItem", attrs: { checked: false }, content: [p(i)] })),
});
const table = (header: string[], rows: number): JSONContent => ({
  type: "table",
  content: [
    {
      type: "tableRow",
      content: header.map((h) => ({ type: "tableHeader", content: [p(h)] })),
    },
    ...Array.from({ length: rows }, () => ({
      type: "tableRow",
      content: header.map(() => ({ type: "tableCell", content: [p()] })),
    })),
  ],
});
const doc = (...content: JSONContent[]): DocJson => ({ type: "doc", content });

export type NoteTemplate = {
  id: string;
  name: string;
  description: string;
  noteType: NoteTypeValue;
  /** Default title; "{client}" is replaced with the client's name when one is chosen. */
  title: string;
  build: () => DocJson;
};

export const TEMPLATES: readonly NoteTemplate[] = [
  {
    id: "discovery",
    name: "Discovery call",
    description: "First conversation: goals, situation and next steps.",
    noteType: "DISCOVERY",
    title: "Discovery call – {client}",
    build: () =>
      doc(
        h2("Goals & timeline"),
        p(),
        h2("Property"),
        bullets(["Type / location:", "Price range:"]),
        h2("Household"),
        p(),
        h2("Income & deposit"),
        bullets(["Income:", "Deposit / savings:", "Grants (e.g. FHOG):"]),
        h2("Concerns & preferences"),
        p(),
        h2("Next steps"),
        tasks(["Send fact find", "Request ID and payslips"]),
      ),
  },
  {
    id: "fact-find",
    name: "Fact find",
    description: "Applicants, income, assets, liabilities, objectives.",
    noteType: "FACT_FIND",
    title: "Fact find – {client}",
    build: () =>
      doc(
        h2("Applicants"),
        p(),
        h2("Employment & income"),
        bullets(["Applicant 1:", "Applicant 2:"]),
        h2("Assets"),
        p(),
        h2("Liabilities & expenses"),
        bullets(["Loans / cards:", "Living expenses (HEM check):"]),
        h2("Credit history"),
        p(),
        h2("Requirements & objectives"),
        p(),
        h2("Foreseeable changes"),
        p("Any expected change in income or circumstances over the loan term?"),
      ),
  },
  {
    id: "lender-rationale",
    name: "Best interests / lender rationale",
    description: "Why this product suits — compliant with RG 273.",
    noteType: "LENDER_RATIONALE",
    title: "Lender rationale – {client}",
    build: () =>
      doc(
        h2("Client requirements & objectives"),
        p(),
        h2("Lenders & products considered"),
        table(["Lender", "Product", "Rate", "Fees", "Features"], 3),
        h2("Recommended product"),
        p(),
        h2("Why it is in the client's best interests"),
        p(),
        h2("Why other options were not recommended"),
        p(),
      ),
  },
  {
    id: "conditions",
    name: "Conditions tracker",
    description: "Outstanding approval conditions and documents.",
    noteType: "CONDITIONS",
    title: "Conditions – {client}",
    build: () =>
      doc(
        h2("Lender & approval"),
        bullets(["Lender:", "Approval type (conditional / unconditional):"]),
        h2("Outstanding conditions"),
        tasks(["Valuation", "Updated payslips", "Signed contract of sale"]),
        h2("Documents requested"),
        tasks(["", ""]),
        h2("Due dates"),
        p(),
      ),
  },
  {
    id: "lender-update",
    name: "Lender update",
    description: "What the lender said, what they need next, and who's chasing it.",
    noteType: "CONDITIONS",
    title: "Lender update – {client}",
    build: () =>
      doc(
        h2("Lender & application"),
        bullets(["Lender:", "Lender / application reference:", "Assessor or BDM:"]),
        h2("Update received"),
        p(),
        h2("Additional requirements"),
        p(),
        h2("Outstanding documents"),
        tasks(["", ""]),
        h2("Next action"),
        p(),
      ),
  },
  {
    id: "client-meeting",
    name: "Client meeting",
    description: "Who attended, what was discussed and decided, and follow-ups.",
    noteType: "GENERAL",
    title: "Client meeting – {client}",
    build: () =>
      doc(
        h2("Meeting details"),
        bullets(["Date and time:", "Attendees:", "In person / phone / video:"]),
        h2("Discussion summary"),
        p(),
        h2("Decisions"),
        p(),
        h2("Questions raised"),
        p(),
        h2("Follow-up actions"),
        tasks(["", ""]),
      ),
  },
  {
    id: "settlement",
    name: "Settlement",
    description: "Final figures, briefing and post-settlement tasks.",
    noteType: "SETTLEMENT",
    title: "Settlement – {client}",
    build: () =>
      doc(
        h2("Settlement details"),
        bullets(["Settlement date:", "Lender:", "Final loan amount / rate:"]),
        h2("Fees"),
        p(),
        h2("Client briefing"),
        p("Explained repayments, offset/redraw and rate review process."),
        h2("Post-settlement"),
        tasks(["Send welcome email", "Set annual review reminder"]),
      ),
  },
  {
    id: "review",
    name: "Annual / refinance review",
    description: "Check the loan still suits; compare the market.",
    noteType: "REVIEW",
    title: "Loan review – {client}",
    build: () =>
      doc(
        h2("Current loan"),
        bullets(["Lender / product:", "Rate:", "Balance:"]),
        h2("Change in circumstances"),
        p(),
        h2("Market comparison"),
        table(["Lender", "Rate", "Fees", "Saving p.a."], 2),
        h2("Recommendation"),
        p(),
      ),
  },
] as const;

export const BLANK_TEMPLATE_ID = "blank";

export function getTemplate(id: string): NoteTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Content, type and title for a new note from a template (or blank). */
export function noteFromTemplate(
  templateId: string,
  clientName?: string | null,
): { contentJson: DocJson; noteType: NoteTypeValue; title: string } {
  const t = getTemplate(templateId);
  if (!t) return { contentJson: EMPTY_DOC, noteType: "GENERAL", title: "" };
  const title = clientName
    ? t.title.replace("{client}", clientName)
    : t.title.replace(" – {client}", "");
  return { contentJson: t.build(), noteType: t.noteType, title };
}
