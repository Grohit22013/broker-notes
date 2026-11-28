import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import type {
  AmendmentDto,
  CreatedNoteDto,
  NoteDetailDto,
  NoteFacetsDto,
  NoteMetaDto,
  NotesListDto,
  SavedNoteDto,
  VersionDetailDto,
  VersionDto,
} from "@broker-notes/shared/dto";
import { parseNoteFilters } from "@broker-notes/shared/notes/filters";
import {
  amendmentSchema,
  noteIdSchema,
  noteTemplateSchema,
  updateNoteMetaSchema,
  updateNoteSchema,
} from "@broker-notes/shared/notes/validation";
import { z } from "zod";

import { CurrentUser, type SessionUser } from "../auth/auth.guard";
import { ZodBody, ZodPipe } from "../common/zod";
import { SESSION_COOKIE } from "../config";

import { NotesService } from "./notes.service";

const idPipe = new ZodPipe(noteIdSchema);
const contentBody = updateNoteSchema.omit({ id: true });
const metaBody = updateNoteMetaSchema.omit({ id: true });
const amendmentBody = amendmentSchema.omit({ noteId: true });
const createBody = noteTemplateSchema;

@ApiTags("notes")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("notes")
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @ApiOperation({
    summary: "List the brokerage's notes",
    description:
      "Query: q, stage, type, tag, client, due=1, mine=1, sort=updated|created|followup|title. Pinned first.",
  })
  async list(
    @CurrentUser() user: SessionUser,
    @Query() query: Record<string, string>,
  ): Promise<NotesListDto> {
    return { items: await this.notes.list(user, parseNoteFilters(query)) };
  }

  @Get("facets")
  @ApiOperation({ summary: "Totals, follow-ups due and distinct tags (for filters)" })
  facets(@CurrentUser() user: SessionUser): Promise<NoteFacetsDto> {
    return this.notes.facets(user);
  }

  @Post()
  @ApiOperation({ summary: "Create a note, optionally from a template and for a client" })
  @ZodBody(createBody)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(createBody)) body: z.output<typeof createBody>,
  ): Promise<CreatedNoteDto> {
    return this.notes.create(user, body.templateId, body.clientId);
  }

  @Get(":id")
  @ApiParam({ name: "id" })
  @ApiOperation({ summary: "A note with its content and amendments" })
  get(@CurrentUser() user: SessionUser, @Param("id", idPipe) id: string): Promise<NoteDetailDto> {
    return this.notes.get(user, id);
  }

  @Put(":id/content")
  @ApiOperation({ summary: "Autosave title + body (409 if finalised)" })
  @ZodBody(contentBody)
  saveContent(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodPipe(contentBody)) body: z.output<typeof contentBody>,
  ): Promise<SavedNoteDto> {
    return this.notes.saveContent(user, id, body);
  }

  @Patch(":id/meta")
  @ApiOperation({
    summary: "Update details: type, stage, tags, follow-up, pin, client, key figures",
  })
  @ZodBody(metaBody)
  updateMeta(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodPipe(metaBody)) body: z.output<typeof metaBody>,
  ): Promise<NoteMetaDto> {
    return this.notes.updateMeta(user, id, body);
  }

  @Post(":id/finalise")
  @HttpCode(204)
  @ApiOperation({ summary: "Finalise (lock) the note — irreversible" })
  finalise(@CurrentUser() user: SessionUser, @Param("id", idPipe) id: string): Promise<void> {
    return this.notes.finalise(user, id);
  }

  @Post(":id/amendments")
  @ApiOperation({ summary: "Append a timestamped amendment to a finalised note" })
  @ZodBody(amendmentBody)
  addAmendment(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodPipe(amendmentBody)) body: z.output<typeof amendmentBody>,
  ): Promise<AmendmentDto> {
    return this.notes.addAmendment(user, id, body.body);
  }

  @Get(":id/versions")
  @ApiOperation({ summary: "Version history, newest first" })
  versions(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
  ): Promise<VersionDto[]> {
    return this.notes.versions(user, id);
  }

  @Post(":id/versions")
  @HttpCode(201)
  @ApiOperation({ summary: "Snapshot the current state (before restoring an older version)" })
  snapshot(@CurrentUser() user: SessionUser, @Param("id", idPipe) id: string): Promise<void> {
    return this.notes.snapshot(user, id);
  }

  @Get(":id/versions/:versionId")
  @ApiOperation({ summary: "One version's content" })
  version(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
    @Param("versionId", idPipe) versionId: string,
  ): Promise<VersionDetailDto> {
    return this.notes.version(user, id, versionId);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Soft-delete (the record is retained for compliance)" })
  remove(@CurrentUser() user: SessionUser, @Param("id", idPipe) id: string): Promise<void> {
    return this.notes.remove(user, id);
  }
}
