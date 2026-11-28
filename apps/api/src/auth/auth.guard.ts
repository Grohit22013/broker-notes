import {
  createParamDecorator,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { SESSION_COOKIE } from "../config";

export type SessionUser = { id: string; name: string; email: string };
type JwtPayload = { sub: string; name: string; email: string };

const IS_PUBLIC = "isPublic";
/** Opt a route out of the global auth guard (login, register, health, docs). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The signed-in broker for this request (set by AuthGuard). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser =>
    ctx.switchToHttp().getRequest<Request & { user: SessionUser }>().user,
);

/**
 * Global guard: every route requires a valid session unless marked @Public().
 * Accepts the httpOnly session cookie (browser) or `Authorization: Bearer` (API clients/tests).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const token = tokenFrom(req);
    if (!token) throw new UnauthorizedException("Please sign in.");
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = { id: payload.sub, name: payload.name, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException("Your session has expired. Please sign in again.");
    }
  }
}

function tokenFrom(req: Request): string | null {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}
