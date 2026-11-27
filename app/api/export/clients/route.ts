import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listClients } from "@/lib/clients/queries";
import { csvFilename, toCsv } from "@/lib/csv";
import { toIsoDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** CSV of the broker's clients. The column names match what the importer recognises. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const clients = await listClients(user.id);
  const rows = clients.map((c) => [
    c.name,
    c.email ?? "",
    c.phone ?? "",
    c.noteCount,
    c.lastNoteAt ? toIsoDateTime(c.lastNoteAt) : "",
  ]);

  return new NextResponse(toCsv(["Name", "Email", "Phone", "Notes", "Last note"], rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("clients")}"`,
      "Cache-Control": "no-store",
    },
  });
}
