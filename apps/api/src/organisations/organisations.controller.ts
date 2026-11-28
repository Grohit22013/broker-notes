import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type {
  AuditPageDto,
  CreatedInviteDto,
  InvitePreviewDto,
  MemberDto,
  OrganisationDto,
  UserRefDto,
} from "@broker-notes/shared/dto";
import {
  auditQuerySchema,
  createInviteSchema,
  inviteIdSchema,
  inviteTokenSchema,
  memberIdSchema,
  renameOrganisationSchema,
  updateMemberSchema,
  type CreateInviteInput,
  type UpdateMemberInput,
} from "@broker-notes/shared/orgs/validation";
import type { z } from "zod";

import { AuditService } from "../audit/audit.service";
import { AllowRoles, CurrentUser, Public, type SessionUser } from "../auth/auth.guard";
import { ZodBody, ZodPipe } from "../common/zod";
import { SESSION_COOKIE } from "../config";

import { OrganisationsService } from "./organisations.service";

const ADMIN_ONLY = AllowRoles(["ADMIN"], "Only brokerage admins can manage the team.");

@ApiTags("organisation")
@ApiCookieAuth(SESSION_COOKIE)
@Controller()
export class OrganisationsController {
  constructor(
    private readonly orgs: OrganisationsService,
    private readonly audit: AuditService,
  ) {}

  @Get("organisation")
  @ApiOperation({ summary: "The brokerage: name, members (and pending invites for admins)" })
  get(@CurrentUser() user: SessionUser): Promise<OrganisationDto> {
    return this.orgs.get(user);
  }

  @Get("organisation/members")
  @ApiOperation({ summary: "Active members (id + name) for pickers" })
  members(@CurrentUser() user: SessionUser): Promise<UserRefDto[]> {
    return this.orgs.activeMembers(user.organisationId);
  }

  @Patch("organisation")
  @ADMIN_ONLY
  @ApiOperation({ summary: "Rename the brokerage (admin)" })
  @ZodBody(renameOrganisationSchema)
  rename(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(renameOrganisationSchema)) body: z.output<typeof renameOrganisationSchema>,
  ): Promise<OrganisationDto> {
    return this.orgs.rename(user, body.name);
  }

  @Patch("organisation/members/:id")
  @ADMIN_ONLY
  @ApiOperation({ summary: "Change a member's role or (de)activate them (admin)" })
  @ZodBody(updateMemberSchema)
  updateMember(
    @CurrentUser() user: SessionUser,
    @Param("id", new ZodPipe(memberIdSchema)) id: string,
    @Body(new ZodPipe(updateMemberSchema)) body: UpdateMemberInput,
  ): Promise<MemberDto> {
    return this.orgs.updateMember(user, id, body);
  }

  @Post("organisation/invites")
  @ADMIN_ONLY
  @ApiOperation({
    summary: "Create a single-use invite link (admin)",
    description: "The token is returned once; send the link to the invitee. Expires in 7 days.",
  })
  @ZodBody(createInviteSchema)
  invite(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(createInviteSchema)) body: CreateInviteInput,
  ): Promise<CreatedInviteDto> {
    return this.orgs.invite(user, body);
  }

  @Delete("organisation/invites/:id")
  @ADMIN_ONLY
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke a pending invite (admin)" })
  revoke(
    @CurrentUser() user: SessionUser,
    @Param("id", new ZodPipe(inviteIdSchema)) id: string,
  ): Promise<void> {
    return this.orgs.revokeInvite(user, id);
  }

  @Public()
  @Throttle({ default: { limit: () => Number(process.env.AUTH_RATE_LIMIT) || 10, ttl: 60_000 } })
  @Get("invites/:token")
  @ApiOperation({ summary: "Preview an invite link (public; 404 if invalid, used or expired)" })
  preview(
    @Param("token", new ZodPipe(inviteTokenSchema)) token: string,
  ): Promise<InvitePreviewDto> {
    return this.orgs.preview(token);
  }

  @Get("audit")
  @AllowRoles(["ADMIN"], "Only brokerage admins can view the audit log.")
  @ApiOperation({
    summary: "Audit log, newest first (admin)",
    description: "Query: category=note|client|team|export|ai|auth, cursor=<last id>.",
  })
  auditLog(
    @CurrentUser() user: SessionUser,
    @Query(new ZodPipe(auditQuerySchema)) query: z.output<typeof auditQuerySchema>,
  ): Promise<AuditPageDto> {
    return this.audit.list(user.organisationId, query);
  }
}
