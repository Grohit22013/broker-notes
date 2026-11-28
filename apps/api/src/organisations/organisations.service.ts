import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreatedInviteDto,
  InviteDto,
  InvitePreviewDto,
  MemberDto,
  OrganisationDto,
  UserRefDto,
} from "@broker-notes/shared/dto";
import {
  canManageTeam,
  INVITE_TTL_DAYS,
  memberChangeProblem,
  roleLabel,
} from "@broker-notes/shared/orgs/roles";
import type { CreateInviteInput, UpdateMemberInput } from "@broker-notes/shared/orgs/validation";

import { AuditService } from "../audit/audit.service";
import type { SessionUser } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

import { hashInviteToken, newInviteToken } from "./invite-token";

const DAY_MS = 86_400_000;

const inviteSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  expiresAt: true,
  invitedBy: { select: { name: true } },
} as const;

type InviteRow = {
  id: string;
  email: string;
  role: InviteDto["role"];
  createdAt: Date;
  expiresAt: Date;
  invitedBy: { name: string };
};

const toInviteDto = (i: InviteRow, now = new Date()): InviteDto => ({
  id: i.id,
  email: i.email,
  role: i.role,
  createdAt: i.createdAt.toISOString(),
  expiresAt: i.expiresAt.toISOString(),
  invitedBy: i.invitedBy.name,
  expired: i.expiresAt <= now,
});

/** The brokerage: its members, invites and name. Everything is scoped to the caller's org. */
@Injectable()
export class OrganisationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(actor: SessionUser): Promise<OrganisationDto> {
    const org = await this.db.organisation.findUniqueOrThrow({
      where: { id: actor.organisationId },
      select: {
        id: true,
        name: true,
        members: {
          orderBy: [{ deactivatedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            deactivatedAt: true,
            createdAt: true,
          },
        },
      },
    });
    const invites = canManageTeam(actor)
      ? await this.db.invite.findMany({
          where: { organisationId: actor.organisationId, acceptedAt: null, revokedAt: null },
          orderBy: { createdAt: "desc" },
          select: inviteSelect,
        })
      : [];
    const members: MemberDto[] = org.members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      active: m.deactivatedAt === null,
      joinedAt: m.createdAt.toISOString(),
    }));
    return { id: org.id, name: org.name, members, invites: invites.map((i) => toInviteDto(i)) };
  }

  /** Active members (for "assigned adviser" pickers and author filters). */
  async activeMembers(organisationId: string): Promise<UserRefDto[]> {
    return this.db.user.findMany({
      where: { organisationId, deactivatedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  async rename(actor: SessionUser, name: string): Promise<OrganisationDto> {
    if (name !== actor.organisationName) {
      await this.db.$transaction(async (tx) => {
        await tx.organisation.update({ where: { id: actor.organisationId }, data: { name } });
        await this.audit.record(
          actor,
          {
            action: "organisation.renamed",
            summary: `Renamed the brokerage to “${name}”`,
            entityType: "organisation",
            entityId: actor.organisationId,
            metadata: { from: actor.organisationName, to: name },
          },
          tx,
        );
      });
    }
    return this.get({ ...actor, organisationName: name });
  }

  async updateMember(
    actor: SessionUser,
    memberId: string,
    change: UpdateMemberInput,
  ): Promise<MemberDto> {
    if (memberId === actor.id && change.active === false) {
      throw new BadRequestException("You can't deactivate your own account.");
    }
    return this.db.$transaction(async (tx) => {
      const members = await tx.user.findMany({
        where: { organisationId: actor.organisationId },
        select: { id: true, name: true, role: true, deactivatedAt: true },
      });
      const target = members.find((m) => m.id === memberId);
      // Another brokerage's member looks exactly like a missing one.
      if (!target) throw new NotFoundException("Member not found");
      const problem = memberChangeProblem(
        members.map((m) => ({ id: m.id, role: m.role, active: m.deactivatedAt === null })),
        memberId,
        change,
      );
      if (problem) throw new ConflictException(problem);

      const updated = await tx.user.update({
        where: { id: memberId },
        data: {
          ...(change.role ? { role: change.role } : {}),
          ...(change.active === undefined
            ? {}
            : { deactivatedAt: change.active ? null : (target.deactivatedAt ?? new Date()) }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          deactivatedAt: true,
          createdAt: true,
        },
      });

      if (change.role && change.role !== target.role) {
        await this.audit.record(
          actor,
          {
            action: "member.role_changed",
            summary: `Changed ${target.name}'s role from ${roleLabel(target.role)} to ${roleLabel(change.role)}`,
            entityType: "member",
            entityId: memberId,
            metadata: { from: target.role, to: change.role },
          },
          tx,
        );
      }
      const wasActive = target.deactivatedAt === null;
      if (change.active !== undefined && change.active !== wasActive) {
        await this.audit.record(
          actor,
          {
            action: change.active ? "member.reactivated" : "member.deactivated",
            summary: `${change.active ? "Reactivated" : "Deactivated"} ${target.name}`,
            entityType: "member",
            entityId: memberId,
          },
          tx,
        );
      }
      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        active: updated.deactivatedAt === null,
        joinedAt: updated.createdAt.toISOString(),
      };
    });
  }

  /**
   * Creates a single-use invite link. There's no email provider, so the admin copies the link and
   * sends it themselves; the raw token is returned exactly once and only its hash is stored.
   */
  async invite(actor: SessionUser, input: CreateInviteInput): Promise<CreatedInviteDto> {
    const existing = await this.db.user.findUnique({
      where: { email: input.email },
      select: { organisationId: true },
    });
    if (existing) {
      throw new ConflictException({
        message:
          existing.organisationId === actor.organisationId
            ? "This person is already a member of your brokerage."
            : "This email already has a BrokerNotes account, so it can't be invited.",
        field: "email",
      });
    }
    const token = newInviteToken();
    const invite = await this.db.$transaction(async (tx) => {
      // A newer invite replaces any pending one for the same email.
      await tx.invite.updateMany({
        where: {
          organisationId: actor.organisationId,
          email: input.email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const created = await tx.invite.create({
        data: {
          organisationId: actor.organisationId,
          email: input.email,
          role: input.role,
          tokenHash: hashInviteToken(token),
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS),
          invitedById: actor.id,
        },
        select: inviteSelect,
      });
      await this.audit.record(
        actor,
        {
          action: "member.invited",
          summary: `Invited ${input.email} as ${roleLabel(input.role)}`,
          entityType: "invite",
          entityId: created.id,
          metadata: { role: input.role },
        },
        tx,
      );
      return created;
    });
    return { ...toInviteDto(invite), token };
  }

  async revokeInvite(actor: SessionUser, inviteId: string): Promise<void> {
    const invite = await this.db.invite.findFirst({
      where: {
        id: inviteId,
        organisationId: actor.organisationId,
        acceptedAt: null,
        revokedAt: null,
      },
      select: { id: true, email: true },
    });
    if (!invite) throw new NotFoundException("Invite not found");
    await this.db.$transaction(async (tx) => {
      await tx.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
      await this.audit.record(
        actor,
        {
          action: "invite.revoked",
          summary: `Revoked the invite for ${invite.email}`,
          entityType: "invite",
          entityId: invite.id,
        },
        tx,
      );
    });
  }

  /** Public: what an invite link is for, so the register page can show it. */
  async preview(token: string): Promise<InvitePreviewDto> {
    const invite = await this.db.invite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        organisation: { select: { name: true } },
        invitedBy: { select: { name: true } },
      },
    });
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
      throw new NotFoundException(
        "This invite link is invalid or has expired. Ask your brokerage admin for a new one.",
      );
    }
    return {
      organisationName: invite.organisation.name,
      email: invite.email,
      role: invite.role,
      invitedBy: invite.invitedBy.name,
    };
  }
}
