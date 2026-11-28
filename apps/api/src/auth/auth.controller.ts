import { Body, Controller, Get, HttpCode, Post, Res } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "@broker-notes/shared/auth/validation";
import type { AuthUserDto } from "@broker-notes/shared/dto";
import type { Response } from "express";

import { ZodBody, ZodPipe } from "../common/zod";
import { loadConfig, SESSION_COOKIE, SESSION_MAX_AGE_S } from "../config";

import { CurrentUser, Public, type SessionUser } from "./auth.guard";
import { AuthService } from "./auth.service";

/**
 * Login/registration are rate-limited harder than the rest of the API (brute-force protection).
 * Resolved per request so tests can raise it via AUTH_RATE_LIMIT.
 */
const AUTH_THROTTLE = {
  default: { limit: () => Number(process.env.AUTH_RATE_LIMIT) || 10, ttl: 60_000 },
};

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("register")
  @ApiOperation({ summary: "Create a broker account and start a session" })
  @ZodBody(registerSchema)
  async register(
    @Body(new ZodPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    const user = await this.auth.register(body);
    await this.setSession(res, user);
    return user;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in; sets an httpOnly session cookie" })
  @ZodBody(loginSchema)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    const user = await this.auth.login(body);
    await this.setSession(res, user);
    return user;
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  @ApiOperation({ summary: "Sign out (clears the session cookie)" })
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get("me")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "The signed-in broker" })
  me(@CurrentUser() user: SessionUser): Promise<AuthUserDto> {
    return this.auth.me(user.id);
  }

  private async setSession(res: Response, user: AuthUserDto) {
    res.cookie(SESSION_COOKIE, await this.auth.issueToken(user), {
      ...this.cookieOptions(),
      maxAge: SESSION_MAX_AGE_S * 1000,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: loadConfig().cookieSecure,
      path: "/",
    };
  }
}
