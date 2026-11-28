import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import type { LoginInput, RegisterInput } from "@broker-notes/shared/auth/validation";
import type { AuthUserDto } from "@broker-notes/shared/dto";
import { roleLabel } from "@broker-notes/shared/orgs/roles";
import { inviteTokenSchema } from "@broker-notes/shared/orgs/validation";

import { AuditService } from "../audit/audit.service";
import { hashInviteToken } from "../organisations/invite-token";
import { PrismaService } from "../prisma/prisma.service";

import { claimsFor } from "./auth.guard";
import { hashPassword, verifyPassword } from "./password";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  organisationId: true,
  organisation: { select: { name: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const toDto = (u: UserRow): AuthUserDto => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  organisationId: u.organisationId,
  organisationName: u.organisation.name,
});

const INVALID_INVITE =
  "This invite link is invalid or has expired. Ask your brokerage admin for a new one.";

function emailTaken(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictException({
      message: "An account with this email already exists. Try signing in.",
      field: "email",
    });
  }
  throw err;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Without an invite: creates a new brokerage with this person as its admin.
   * With an invite: joins the inviting brokerage with the invited role (single use, email-bound).
   */
  async register(input: RegisterInput): Promise<AuthUserDto> {
    const passwordHash = await hashPassword(input.password);
    if (input.inviteToken) return this.registerWithInvite(input, passwordHash);

    const user = await this.db
      .$transaction(async (tx) => {
        const org = await tx.organisation.create({
          data: { name: input.organisationName ?? `${input.name}'s brokerage` },
          select: { id: true, name: true },
        });
        const created = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash,
            organisationId: org.id,
            role: "ADMIN",
          },
          select: userSelect,
        });
        await this.audit.record(
          created,
          {
            action: "organisation.created",
            summary: `Created the brokerage “${org.name}”`,
            entityType: "organisation",
            entityId: org.id,
          },
          tx,
        );
        return created;
      })
      .catch(emailTaken);
    return toDto(user);
  }

  private async registerWithInvite(input: RegisterInput, passwordHash: string) {
    const token = inviteTokenSchema.safeParse(input.inviteToken);
    if (!token.success) throw new BadRequestException(INVALID_INVITE);

    const user = await this.db
      .$transaction(async (tx) => {
        const invite = await tx.invite.findUnique({
          where: { tokenHash: hashInviteToken(token.data) },
          select: {
            id: true,
            email: true,
            role: true,
            organisationId: true,
            expiresAt: true,
            acceptedAt: true,
            revokedAt: true,
          },
        });
        if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
          throw new BadRequestException(INVALID_INVITE);
        }
        if (invite.email !== input.email) {
          throw new BadRequestException({
            message: `This invite is for ${invite.email}. Register with that email address.`,
            field: "email",
          });
        }
        // Claim the invite atomically: a second registration with the same link finds nothing.
        const claimed = await tx.invite.updateMany({
          where: { id: invite.id, acceptedAt: null, revokedAt: null },
          data: { acceptedAt: new Date() },
        });
        if (claimed.count !== 1) throw new BadRequestException(INVALID_INVITE);

        const created = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash,
            organisationId: invite.organisationId,
            role: invite.role,
          },
          select: userSelect,
        });
        await this.audit.record(
          created,
          {
            action: "member.joined",
            summary: `Joined as ${roleLabel(created.role)}`,
            entityType: "member",
            entityId: created.id,
            metadata: { role: created.role },
          },
          tx,
        );
        return created;
      })
      .catch(emailTaken);
    return toDto(user);
  }

  /** Same response time and message whether or not the email exists (no account enumeration). */
  async login({ email, password }: LoginInput): Promise<AuthUserDto> {
    const user = await this.db.user.findUnique({
      where: { email },
      select: { ...userSelect, passwordHash: true, deactivatedAt: true },
    });
    const valid = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !valid) throw new UnauthorizedException("Incorrect email or password.");
    // Only revealed after a correct password, so it can't be used to probe for accounts.
    if (user.deactivatedAt) {
      throw new UnauthorizedException(
        "This account has been deactivated. Contact your brokerage admin.",
      );
    }
    await this.audit.record(user, { action: "auth.signed_in", summary: "Signed in" });
    return toDto(user);
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!user) throw new UnauthorizedException("Please sign in.");
    return toDto(user);
  }

  issueToken(user: AuthUserDto): Promise<string> {
    return this.jwt.signAsync(claimsFor(user));
  }
}
