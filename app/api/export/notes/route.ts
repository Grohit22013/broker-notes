import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { csvFilename, toCsv } from "@/lib/csv";
import { toIsoDate, toIsoDateTime } from "@/lib/dates";
import { parseNoteFilters } from "@/lib/notes/filters";
import { lvrOf } from "@/lib/notes/key-figures";
import { listNotesForExport } from "@/lib/notes/queries";
import { loanStage, noteTypeLabel } from "@/lib/notes/taxonomy";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Title",
  "Client",
  "Note type",
  "Loan stage",
  "Tags",
  "Follow-up date",
  "Status",
  "Finalised at",
  "Loan amount (AUD)",
  "Property value (AUD)",
  "LVR %",
  "Income (AUD p.a.)",
  "Rate % p.a.",
  "Lender",
  "Created",
  "Last edited",
  "Note text",
] as const;

/** CSV of the broker's notes, honouring the same filters as the notes list (?q=&stage=…). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const filters = parseNoteFilters(Object.fromEntries(req.nextUrl.searchParams));
  const notes = await listNotesForExport(user.id, filters);

  const rows = notes.map((n) => {
    const k = n.keyFigures;
    return [
      n.title || "Untitled note",
      n.client?.name ?? "",
      noteTypeLabel(n.noteType),
      n.loanStage ? loanStage(n.loanStage).label : "",
      n.tags.join("; "),
      n.followUpAt ? toIsoDate(n.followUpAt) : "",
      n.status === "FINALISED" ? "Finalised" : "Draft",
      n.finalisedAt ? toIsoDateTime(n.finalisedAt) : "",
      k.loanAmount ?? "",
      k.propertyValue ?? "",
      lvrOf(k) ?? "",
      k.income ?? "",
      k.rate ?? "",
      k.lender ?? "",
      toIsoDateTime(n.createdAt),
      toIsoDateTime(n.updatedAt),
      n.contentText,
    ];
  });

  return new NextResponse(toCsv(HEADERS, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("notes")}"`,
      "Cache-Control": "no-store",
    },
  });
}
