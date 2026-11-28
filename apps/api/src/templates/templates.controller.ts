import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { OrgTemplateDto } from "@broker-notes/shared/dto";
import {
  createOrgTemplateSchema,
  type CreateOrgTemplateInput,
} from "@broker-notes/shared/notes/validation";
import { z } from "zod";

import { AllowRoles, CurrentUser, type SessionUser } from "../auth/auth.guard";
import { ZodBody, ZodPipe } from "../common/zod";
import { SESSION_COOKIE } from "../config";

import { TemplatesService } from "./templates.service";

const idPipe = new ZodPipe(z.cuid({ error: "Invalid template" }));

@ApiTags("templates")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: "The brokerage's own note templates (built-ins are in the web app)" })
  list(@CurrentUser() user: SessionUser): Promise<OrgTemplateDto[]> {
    return this.templates.list(user);
  }

  @Post()
  @AllowRoles(["ADMIN", "ADVISER"], "Case managers can use templates but not create them.")
  @ApiOperation({ summary: "Save a note's structure as a brokerage template" })
  @ZodBody(createOrgTemplateSchema)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(createOrgTemplateSchema)) body: CreateOrgTemplateInput,
  ): Promise<OrgTemplateDto> {
    return this.templates.create(user, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove (archive) a template — its creator or an admin" })
  remove(@CurrentUser() user: SessionUser, @Param("id", idPipe) id: string): Promise<void> {
    return this.templates.remove(user, id);
  }
}
