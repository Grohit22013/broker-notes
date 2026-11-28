import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { Public } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { ClientsController } from "./clients/clients.controller";
import { ClientsService } from "./clients/clients.service";
import { ExportController } from "./export/export.controller";
import { NotesController } from "./notes/notes.controller";
import { NotesService } from "./notes/notes.service";
import { PrismaModule, PrismaService } from "./prisma/prisma.service";

@ApiTags("health")
@Controller("health")
class HealthController {
  constructor(private readonly db: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Liveness + database check" })
  async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}

@Module({
  imports: [
    PrismaModule,
    // Generous default; auth routes override with a stricter limit.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 300 }]),
    AuthModule,
  ],
  controllers: [HealthController, NotesController, ClientsController, ExportController],
  providers: [NotesService, ClientsService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
