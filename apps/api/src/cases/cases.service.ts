import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  caseStage,
  formatCaseReference,
  OPEN_CASE_STAGES,
  CASE_REFERENCE_PREFIX,
} from "@broker-notes/shared/cases/taxonomy";
import {
  detailFieldsIn,
  type CaseFilters,
  type CreateCaseData,
  type UpdateCaseData,
} from "@broker-notes/shared/cases/validation";
import { zonedYmd } from "@broker-notes/shared/dates";
import type { CaseDetailDto, CaseListItemDto, CaseOptionDto } from "@broker-notes/shared/dto";
import { canManageCases } from "@broker-notes/shared/orgs/roles";

import { AuditService } from "../audit/audit.service";
import type { SessionUser } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

const DETAILS_FORBIDDEN =
  "Case managers can move a case through the pipeline but can't change its details.";

const listSelect = {
  id: true,
  reference: true,
  type: true,
  stage: true,
  lender: true,
  loanAmount: true,
  propertyValue: true,
  stageChangedAt: true,
  updatedAt: true,
  client: { select: { id: true, name: true } },
  assignedAdviser: { select: { id: true, name: true } },
  _count: { select: { notes: { where: { deletedAt: null } } } },
} satisfies Prisma.MortgageCaseSelect;

type ListRow = Prisma.MortgageCaseGetPayload<{ select: typeof listSelect }>;

const toListItem = ({ _count, ...r }: ListRow): CaseListItemDto => ({
  ...r,
  noteCount: _count.notes,
  stageChangedAt: r.stageChangedAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const dollars = (v: number | null | undefined) =>
  v === undefined ? undefined : v === null ? null : Math.round(v);

/** Mortgage cases, scoped to the member's brokerage. */
@Injectable()
export class CasesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: SessionUser, f: CaseFilters): Promise<CaseListItemDto[]> {
    const where: Prisma.MortgageCaseWhereInput = { organisationId: actor.organisationId };
    if (f.stage) where.stage = f.stage;
    else if (f.status === "open") where.stage = { in: OPEN_CASE_STAGES };
    else if (f.status === "done") where.stage = { in: ["SETTLED", "CLOSED"] };
    if (f.client) where.clientId = f.client;
    if (f.mine) where.assignedAdviserId = actor.id;
    if (f.q) {
      const contains = { contains: f.q, mode: "insensitive" as const };
      where.OR = [
        { reference: contains },
        { lender: contains },
        { lenderReference: contains },
        { client: { name: contains } },
      ];
    }
    const rows = await this.db.mortgageCase.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 500,
      select: listSelect,
    });
    return rows.map(toListItem);
  }

  /** For pickers: every case (open first), optionally for one client. */
  async options(organisationId: string, clientId?: string): Promise<CaseOptionDto[]> {
    const rows = await this.db.mortgageCase.findMany({
      where: { organisationId, ...(clientId ? { clientId } : {}) },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
      select: {
        id: true,
        reference: true,
        type: true,
        stage: true,
        client: { select: { id: true, name: true } },
      },
    });
    const open = (s: string) => (OPEN_CASE_STAGES as string[]).includes(s);
    return rows
      .map((r) => ({
        id: r.id,
        reference: r.reference,
        type: r.type,
        stage: r.stage,
        clientId: r.client.id,
        clientName: r.client.name,
      }))
      .sort((a, b) => Number(open(b.stage)) - Number(open(a.stage)));
  }

  async get(actor: SessionUser, id: string): Promise<CaseDetailDto> {
    const c = await this.db.mortgageCase.findFirst({
      where: { id, organisationId: actor.organisationId },
      select: {
        ...listSelect,
        lenderReference: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!c) throw new NotFoundException("Case not found");
    const { lenderReference, createdAt, createdBy, ...rest } = c;
    return {
      ...toListItem(rest),
      lenderReference,
      createdAt: createdAt.toISOString(),
      createdBy,
    };
  }

  async create(actor: SessionUser, data: CreateCaseData): Promise<CaseDetailDto> {
    const client = await this.db.client.findFirst({
      where: { id: data.clientId, organisationId: actor.organisationId },
      select: { id: true, name: true },
    });
    if (!client) throw new NotFoundException({ message: "Client not found", field: "clientId" });
    await this.assertAdviser(actor, data.assignedAdviserId);

    const year = zonedYmd(new Date()).year;
    // Next reference for this brokerage and year. Two people creating cases at the same moment
    // can collide on the unique (organisationId, reference) — then simply take the next number.
    for (let attempt = 0; ; attempt++) {
      try {
        const id = await this.db.$transaction(async (tx) => {
          const taken = await tx.mortgageCase.count({
            where: {
              organisationId: actor.organisationId,
              reference: { startsWith: `${CASE_REFERENCE_PREFIX}-${year}-` },
            },
          });
          const reference = formatCaseReference(year, taken + 1 + attempt);
          const created = await tx.mortgageCase.create({
            data: {
              organisationId: actor.organisationId,
              clientId: client.id,
              reference,
              type: data.type,
              stage: data.stage,
              lender: data.lender ?? null,
              lenderReference: data.lenderReference ?? null,
              loanAmount: dollars(data.loanAmount) ?? null,
              propertyValue: dollars(data.propertyValue) ?? null,
              assignedAdviserId: data.assignedAdviserId ?? null,
              createdById: actor.id,
            },
            select: { id: true },
          });
          await this.audit.record(
            actor,
            {
              action: "case.created",
              summary: `Opened case ${reference} for ${client.name}`,
              entityType: "case",
              entityId: created.id,
              metadata: { type: data.type, stage: data.stage },
            },
            tx,
          );
          return created.id;
        });
        return this.get(actor, id);
      } catch (err) {
        const clash = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!clash || attempt >= 4) throw err;
      }
    }
  }

  async update(actor: SessionUser, id: string, data: UpdateCaseData): Promise<CaseDetailDto> {
    const changedDetails = detailFieldsIn(data);
    if (changedDetails.length && !canManageCases(actor)) {
      throw new ForbiddenException(DETAILS_FORBIDDEN);
    }
    const current = await this.db.mortgageCase.findFirst({
      where: { id, organisationId: actor.organisationId },
      select: { reference: true, stage: true },
    });
    if (!current) throw new NotFoundException("Case not found");
    await this.assertAdviser(actor, data.assignedAdviserId);

    const stageChanged = data.stage !== undefined && data.stage !== current.stage;
    await this.db.$transaction(async (tx) => {
      await tx.mortgageCase.update({
        where: { id },
        data: {
          ...data,
          loanAmount: dollars(data.loanAmount),
          propertyValue: dollars(data.propertyValue),
          ...(stageChanged ? { stageChangedAt: new Date() } : {}),
        },
      });
      if (stageChanged) {
        await this.audit.record(
          actor,
          {
            action: "case.stage_changed",
            summary: `Moved ${current.reference} from ${caseStage(current.stage).label} to ${caseStage(data.stage!).label}`,
            entityType: "case",
            entityId: id,
            metadata: { from: current.stage, to: data.stage! },
          },
          tx,
        );
      }
      if (changedDetails.length) {
        await this.audit.record(
          actor,
          {
            action: "case.updated",
            summary: `Updated ${current.reference} (${changedDetails.join(", ")})`,
            entityType: "case",
            entityId: id,
            metadata: { fields: changedDetails },
          },
          tx,
        );
      }
    });
    return this.get(actor, id);
  }

  /** The assigned adviser must be an active member of the same brokerage. */
  private async assertAdviser(actor: SessionUser, adviserId: string | null | undefined) {
    if (!adviserId) return;
    const ok = await this.db.user.count({
      where: { id: adviserId, organisationId: actor.organisationId, deactivatedAt: null },
    });
    if (!ok) {
      throw new NotFoundException({ message: "Adviser not found", field: "assignedAdviserId" });
    }
  }
}
