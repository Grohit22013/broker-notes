import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { RoleValue } from "@broker-notes/shared/orgs/roles";
import type { Request, Response } from "express";

import { loadConfig, SESSION_COOKIE, SESSION_MAX_AGE_S } from "../config";
import { PrismaService } from "../prisma/prisma.service";

/** The signed-in member for this request — always re-read from the database (see AuthGuard). */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: RoleValue;
  organisationId: string;
  organisationName: string;
};

/** Session JWT claims. Role/organisation are a convenience for the web UI, never trusted here. */
export type SessionClaims = {
  sub: string;
  name: string;
  email: string;
  role: RoleValue;
  org: string;
  orgName: string;
};

export function claimsFor(user: SessionUser): SessionClaims {
  return {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    org: user.organisationId,
    orgName: user.organisationName,
  };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: loadConfig().cookieSecure,
    path: "/",
  };
}

const IS_PUBLIC = "isPublic";
const ALLOWED_ROLES = "allowedRoles";

/** Opt a route out of the global auth guard (login, register, health, docs, invite preview). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a route (or controller) to some roles; others get 403 with `message`. */
export const AllowRoles = (roles: RoleValue[], message: string) =>
  SetMetadata(ALLOWED_ROLES, { roles, message });

/** The signed-in member for this request (set by AuthGuard). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser =>
    ctx.switchToHttp().getRequest<Request & { user: SessionUser }>().user,
);

/**
 * Global guard: every route requires a valid session unless marked @Public().
 * Accepts the httpOnly session cookie (browser) or `Authorization: Bearer` (API clients/tests).
 *
 * The token only proves *who* is calling. Role, organisation and active status are loaded from
 * the database on every request, so an admin's change (new role, deactivation) applies at once.
 * When those differ from the token's claims, a refreshed cookie is sent so the web UI catches up.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { user?: SessionUser }>();
    const { token, fromCookie } = tokenFrom(req);
    if (!token) throw new UnauthorizedException("Please sign in.");

    let claims: SessionClaims;
    try {
      claims = await this.jwt.verifyAsync<SessionClaims>(token);
    } catch {
      throw new UnauthorizedException("Your session has expired. Please sign in again.");
    }

    const row = await this.db.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organisationId: true,
        deactivatedAt: true,
        organisation: { select: { name: true } },
      },
    });
    if (!row) throw new UnauthorizedException("Please sign in.");
    if (row.deactivatedAt) {
      throw new UnauthorizedException(
        "This account has been deactivated. Contact your brokerage admin.",
      );
    }
    const user: SessionUser = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      organisationId: row.organisationId,
      organisationName: row.organisation.name,
    };
    req.user = user;

    const fresh = claimsFor(user);
    const stale = (Object.keys(fresh) as (keyof SessionClaims)[]).some(
      (k) => fresh[k] !== claims[k],
    );
    if (stale && fromCookie) {
      http.getResponse<Response>().cookie(SESSION_COOKIE, await this.jwt.signAsync(fresh), {
        ...sessionCookieOptions(),
        maxAge: SESSION_MAX_AGE_S * 1000,
      });
    }

    const rule = this.reflector.getAllAndOverride<{ roles: RoleValue[]; message: string }>(
      ALLOWED_ROLES,
      targets,
    );
    if (rule && !rule.roles.includes(user.role)) throw new ForbiddenException(rule.message);
    return true;
  }
}

function tokenFrom(req: Request): { token: string | null; fromCookie: boolean } {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (cookie) return { token: cookie, fromCookie: true };
  const header = req.headers.authorization;
  return { token: header?.startsWith("Bearer ") ? header.slice(7) : null, fromCookie: false };
}
