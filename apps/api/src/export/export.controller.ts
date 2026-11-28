import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { csvFilename, toCsv } from "@broker-notes/shared/csv";
import { toIsoDate, toIsoDateTime } from "@broker-notes/shared/dates";
import { parseNoteFilters } from "@broker-notes/shared/notes/filters";
import { lvrOf } from "@broker-notes/shared/notes/key-figures";
import { loanStage, noteTypeLabel } from "@broker-notes/shared/notes/taxonomy";
import type { Response } from "express";

import { AuditService } from "../audit/audit.service";
import { AllowRoles, CurrentUser, type SessionUser } from "../auth/auth.guard";
import { ClientsService } from "../clients/clients.service";
import { SESSION_COOKIE } from "../config";
import { NotesService } from "../notes/notes.service";

const NOTE_HEADERS = [
  "Title",
  "Client",
  "Author",
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
@AllowRoles(["ADMIN", "ADVISER"], "Case managers can't export the brokerage's data.")
export class ExportController {
  constructor(
    private readonly notes: NotesService,
    private readonly clients: ClientsService,
    private readonly audit: AuditService,
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
    const rows = await this.notes.exportRows(user, parseNoteFilters(query));
    const csv = toCsv(
      NOTE_HEADERS,
      rows.map((n) => {
        const k = n.keyFigures;
        return [
          n.title || "Untitled note",
          n.client?.name ?? "",
          n.user.name,
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
    await this.audit.record(user, {
      action: "export.notes",
      summary: `Exported ${rows.length} note${rows.length === 1 ? "" : "s"} to CSV`,
      entityType: "export",
      metadata: { count: rows.length },
    });
    this.send(res, csv, csvFilename("notes"));
  }

  @Get("clients")
  @Header("Cache-Control", "no-store")
  @ApiProduces("text/csv")
  @ApiOperation({ summary: "Clients as CSV (columns match what the importer recognises)" })
  async clientsCsv(@CurrentUser() user: SessionUser, @Res() res: Response) {
    const clients = await this.clients.list(user.organisationId);
    const csv = toCsv(
      ["Name", "Email", "Phone", "Assigned adviser", "Notes", "Last note"],
      clients.map((c) => [
        c.name,
        c.email ?? "",
        c.phone ?? "",
        c.assignedAdviser?.name ?? "",
        c.noteCount,
        c.lastNoteAt ? toIsoDateTime(new Date(c.lastNoteAt)) : "",
      ]),
    );
    await this.audit.record(user, {
      action: "export.clients",
      summary: `Exported ${clients.length} client${clients.length === 1 ? "" : "s"} to CSV`,
      entityType: "export",
      metadata: { count: clients.length },
    });
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
