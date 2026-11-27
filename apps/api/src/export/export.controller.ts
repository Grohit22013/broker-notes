import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { csvFilename, toCsv } from "@broker-notes/shared/csv";
import { toIsoDate, toIsoDateTime } from "@broker-notes/shared/dates";
import { parseNoteFilters } from "@broker-notes/shared/notes/filters";
import { lvrOf } from "@broker-notes/shared/notes/key-figures";
import { loanStage, noteTypeLabel } from "@broker-notes/shared/notes/taxonomy";
import type { Response } from "express";

import { CurrentUser, type SessionUser } from "../auth/auth.guard";
import { ClientsService } from "../clients/clients.service";
import { SESSION_COOKIE } from "../config";
import { NotesService } from "../notes/notes.service";

const NOTE_HEADERS = [
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

/** Excel-safe CSV downloads (BOM, CRLF, quoting, formula-injection guard — see shared/csv). */
@ApiTags("export")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("export")
export class ExportController {
  constructor(
    private readonly notes: NotesService,
    private readonly clients: ClientsService,
  ) {}

  @Get("notes")
  @Header("Cache-Control", "no-store")
  @ApiProduces("text/csv")
  @ApiOperation({ summary: "Notes as CSV — honours the same filters as GET /notes" })
  async notesCsv(
    @CurrentUser() user: SessionUser,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const rows = await this.notes.exportRows(user.id, parseNoteFilters(query));
    const csv = toCsv(
      NOTE_HEADERS,
      rows.map((n) => {
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
      }),
    );
    this.send(res, csv, csvFilename("notes"));
  }

  @Get("clients")
  @Header("Cache-Control", "no-store")
  @ApiProduces("text/csv")
  @ApiOperation({ summary: "Clients as CSV (columns match what the importer recognises)" })
  async clientsCsv(@CurrentUser() user: SessionUser, @Res() res: Response) {
    const clients = await this.clients.list(user.id);
    const csv = toCsv(
      ["Name", "Email", "Phone", "Notes", "Last note"],
      clients.map((c) => [
        c.name,
        c.email ?? "",
        c.phone ?? "",
        c.noteCount,
        c.lastNoteAt ? toIsoDateTime(new Date(c.lastNoteAt)) : "",
      ]),
    );
    this.send(res, csv, csvFilename("clients"));
  }

  private send(res: Response, csv: string, filename: string) {
    res
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
      .send(csv);
  }
}
