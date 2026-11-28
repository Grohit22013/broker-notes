import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IMPORT_MAX_ROWS,
  clientIdSchema,
  clientSchema,
  type ClientData,
} from "@broker-notes/shared/clients/validation";
import type {
  ClientDetailDto,
  ClientDto,
  ClientListItemDto,
  ImportResultDto,
} from "@broker-notes/shared/dto";
import { z } from "zod";

import { AllowRoles, CurrentUser, type SessionUser } from "../auth/auth.guard";
import { ZodBody, ZodPipe } from "../common/zod";
import { SESSION_COOKIE } from "../config";

import { ClientsService } from "./clients.service";

const importSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.string().max(1000)))
    .max(IMPORT_MAX_ROWS, `A file can have at most ${IMPORT_MAX_ROWS} rows`),
  mapping: z.object({
    name: z.string({ error: "Choose which column holds the client's name" }).min(1),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
});

const idPipe = new ZodPipe(clientIdSchema);
const CLIENT_WRITERS = AllowRoles(
  ["ADMIN", "ADVISER"],
  "Case managers can view clients but not add or change them.",
);

@ApiTags("clients")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiOperation({ summary: "List clients (search: ?q= name, email or phone)" })
  list(@CurrentUser() user: SessionUser, @Query("q") q?: string): Promise<ClientListItemDto[]> {
    return this.clients.list(user.organisationId, typeof q === "string" ? q : "");
  }

  @Get("options")
  @ApiOperation({ summary: "Id + name of every client (for pickers)" })
  options(@CurrentUser() user: SessionUser) {
    return this.clients.options(user.organisationId);
  }

  @Get("emails")
  @CLIENT_WRITERS
  @ApiOperation({ summary: "Existing client emails (for import duplicate detection)" })
  emails(@CurrentUser() user: SessionUser): Promise<string[]> {
    return this.clients.emails(user.organisationId);
  }

  @Post("import")
  @CLIENT_WRITERS
  @ApiOperation({ summary: "Import clients from mapped CSV rows (duplicates skipped)" })
  @ZodBody(importSchema)
  import(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(importSchema)) body: z.output<typeof importSchema>,
  ): Promise<ImportResultDto> {
    return this.clients.import(user, body.rows, body.mapping);
  }

  @Get(":id")
  @ApiOperation({ summary: "One client" })
  get(@CurrentUser() user: SessionUser, @Param("id", idPipe) id: string): Promise<ClientDetailDto> {
    return this.clients.get(user.organisationId, id);
  }

  @Post()
  @CLIENT_WRITERS
  @ApiOperation({ summary: "Create a client" })
  @ZodBody(clientSchema)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(clientSchema)) body: ClientData,
  ): Promise<ClientDto> {
    return this.clients.create(user, body);
  }

  @Patch(":id")
  @CLIENT_WRITERS
  @ApiOperation({ summary: "Update a client" })
  @ZodBody(clientSchema)
  update(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodPipe(clientSchema)) body: ClientData,
  ): Promise<ClientDto> {
    return this.clients.update(user, id, body);
  }
}
