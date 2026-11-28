import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { AiStatusDto, NoteAnalysisDto } from "@broker-notes/shared/dto";
import { noteIdSchema } from "@broker-notes/shared/notes/validation";
import { z } from "zod";

import { CurrentUser, type SessionUser } from "../auth/auth.guard";
import { ZodBody, ZodPipe } from "../common/zod";
import { SESSION_COOKIE } from "../config";

import { AiService } from "./ai.service";

const analyseBody = z.object({
  /** Re-run even if the note hasn't changed since the last analysis. */
  force: z.boolean().optional().default(false),
});

const idPipe = new ZodPipe(noteIdSchema);

@ApiTags("ai")
@ApiCookieAuth(SESSION_COOKIE)
@Controller()
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get("ai/status")
  @ApiOperation({ summary: "Whether AI is enabled, the (free) model, and today's remaining quota" })
  status(@CurrentUser() user: SessionUser): Promise<AiStatusDto> {
    return this.ai.status(user.id);
  }

  @Get("notes/:id/analysis")
  @ApiOperation({ summary: "The note's latest AI analysis (null if never analysed)" })
  latest(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
  ): Promise<NoteAnalysisDto | null> {
    return this.ai.latest(user.id, id);
  }

  @Post("notes/:id/analysis")
  @HttpCode(200)
  // Short-term burst protection on top of the daily quota (AI_BURST_LIMIT, default 6/min/IP).
  @Throttle({ default: { limit: () => Number(process.env.AI_BURST_LIMIT) || 6, ttl: 60_000 } })
  @ApiOperation({
    summary: "Analyse the note with a free OpenRouter model (redacted; cached while unchanged)",
    description:
      "Returns a summary, action items, key loan figures and an RG 273 Best Interests check. " +
      "TFN, Medicare, card, bank, phone and email details are removed before sending. " +
      "429 when the daily limit is reached; 503 when the AI service is unavailable.",
  })
  @ZodBody(analyseBody)
  analyse(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodPipe(analyseBody)) body: z.output<typeof analyseBody>,
  ): Promise<NoteAnalysisDto> {
    return this.ai.analyse(user.id, id, body.force);
  }
}
