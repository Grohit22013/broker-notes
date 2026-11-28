import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  caseFiltersSchema,
  caseIdSchema,
  createCaseSchema,
  updateCaseSchema,
  type CaseFilters,
  type CreateCaseData,
  type UpdateCaseData,
} from "@broker-notes/shared/cases/validation";
import type { CaseDetailDto, CaseListItemDto, CaseOptionDto } from "@broker-notes/shared/dto";
import { z } from "zod";

import { AllowRoles, CurrentUser, type SessionUser } from "../auth/auth.guard";
import { ZodBody, ZodPipe } from "../common/zod";
import { SESSION_COOKIE } from "../config";

import { CasesService } from "./cases.service";

const idPipe = new ZodPipe(caseIdSchema);
const optionsQuery = z.object({ client: z.cuid().optional().catch(undefined) });

@ApiTags("cases")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("cases")
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  @ApiOperation({
    summary: "List mortgage cases",
    description:
      "Query: q (reference, client, lender), stage, client, status=open|all|done, mine=1.",
  })
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodPipe(caseFiltersSchema)) filters: CaseFilters,
  ): Promise<CaseListItemDto[]> {
    return this.cases.list(user, filters);
  }

  @Get("options")
  @ApiOperation({ summary: "Cases for pickers (open first), optionally for one client" })
  options(
    @CurrentUser() user: SessionUser,
    @Query(new ZodPipe(optionsQuery)) query: z.output<typeof optionsQuery>,
  ): Promise<CaseOptionDto[]> {
    return this.cases.options(user.organisationId, query.client);
  }

  @Get(":id")
  @ApiOperation({ summary: "One case" })
  get(@CurrentUser() user: SessionUser, @Param("id", idPipe) id: string): Promise<CaseDetailDto> {
    return this.cases.get(user, id);
  }

  @Post()
  @AllowRoles(["ADMIN", "ADVISER"], "Case managers can't open new cases.")
  @ApiOperation({ summary: "Open a case for a client (reference assigned automatically)" })
  @ZodBody(createCaseSchema)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(createCaseSchema)) body: CreateCaseData,
  ): Promise<CaseDetailDto> {
    return this.cases.create(user, body);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update a case",
    description: "Everyone may change the stage; other fields need Admin or Adviser.",
  })
  @ZodBody(updateCaseSchema)
  update(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodPipe(updateCaseSchema)) body: UpdateCaseData,
  ): Promise<CaseDetailDto> {
    return this.cases.update(user, id, body);
  }
}
