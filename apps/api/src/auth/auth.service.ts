import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import type { LoginInput, RegisterInput } from "@broker-notes/shared/auth/validation";
import type { AuthUserDto } from "@broker-notes/shared/dto";

import { PrismaService } from "../prisma/prisma.service";

import { hashPassword, verifyPassword } from "./password";

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register({ name, email, password }: RegisterInput): Promise<AuthUserDto> {
    try {
      return await this.db.user.create({
        data: { name, email, passwordHash: await hashPassword(password) },
        select: { id: true, name: true, email: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({
          message: "An account with this email already exists. Try signing in.",
          field: "email",
        });
      }
      throw err;
    }
  }

  /** Same response time and message whether or not the email exists (no account enumeration). */
  async login({ email, password }: LoginInput): Promise<AuthUserDto> {
    const user = await this.db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true },
    });
    const valid = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !valid) throw new UnauthorizedException("Incorrect email or password.");
    return { id: user.id, name: user.name, email: user.email };
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new UnauthorizedException("Please sign in.");
    return user;
  }

  issueToken(user: AuthUserDto): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, name: user.name, email: user.email });
  }
}
