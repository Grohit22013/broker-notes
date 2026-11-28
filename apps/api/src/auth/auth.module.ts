import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";

import { AuditService } from "../audit/audit.service";
import { loadConfig, SESSION_MAX_AGE_S } from "../config";

import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: loadConfig().AUTH_SECRET,
        signOptions: { algorithm: "HS256", expiresIn: SESSION_MAX_AGE_S },
        verifyOptions: { algorithms: ["HS256"] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuditService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuditService],
})
export class AuthModule {}
