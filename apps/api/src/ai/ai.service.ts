import { createHash } from "node:crypto";

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  analysisInput,
  analysisSchema,
  buildUserPrompt,
  docToAiText,
  type Analysis,
} from "@broker-notes/shared/ai/analysis";
import { AI_DAILY_LIMIT, isFreeModel } from "@broker-notes/shared/ai/config";
import { redact } from "@broker-notes/shared/ai/redact";
import { startOfZonedDay, toIsoDate, toLocalDateTime } from "@broker-notes/shared/dates";
import type { AiStatusDto, NoteAnalysisDto } from "@broker-notes/shared/dto";
import { displayTitle, isDocJson } from "@broker-notes/shared/notes/content";

import { AuditService } from "../audit/audit.service";
import type { SessionUser } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

import { OpenRouterClient } from "./openrouter.client";

/** Notes shorter than this don't have enough substance to analyse usefully. */
const MIN_TEXT = 20;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** The note body for the AI: structure kept, checklist items marked open/done. */
function aiTextOf(n: { contentJson: unknown; contentText: string }): string {
  return isDocJson(n.contentJson) ? docToAiText(n.contentJson) : n.contentText;
}

/** Dates already in the note's details (Sydney time), so the AI doesn't suggest them again. */
function scheduledOf(n: { meetingAt: Date | null; followUpAt: Date | null }) {
  return {
    meeting: n.meetingAt ? toLocalDateTime(n.meetingAt).replace("T", " ") : null,
    followUp: n.followUpAt ? toIsoDate(n.followUpAt) : null,
  };
}

/** e.g. "Saturday 2026-11-28" — lets the model resolve "next Tuesday" in the broker's zone. */
function todayInSydney(now = new Date()): string {
  const weekday = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    timeZone: "Australia/Sydney",
  }).format(now);
  return `${weekday} ${toIsoDate(now)}`;
}

/**
 * "Analyse note": one structured AI call per analysis (summary, action items, key figures,
 * Best Interests check). Results are drafts — nothing is written into the note itself; the broker
 * applies them explicitly. Personal identifiers are redacted before anything leaves the server.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly db: PrismaService,
    private readonly client: OpenRouterClient,
    private readonly audit: AuditService,
  ) {}

  async status(userId: string): Promise<AiStatusDto> {
    const config = this.client.config();
    const usedToday = await this.usedToday(userId);
    return {
      enabled: config.provider !== "disabled",
      model: config.provider === "disabled" ? null : (config.models.find(isFreeModel) ?? null),
      dailyLimit: AI_DAILY_LIMIT,
      usedToday,
      remaining: Math.max(0, AI_DAILY_LIMIT - usedToday),
    };
  }

  /** The stored analysis for a note (if any), flagged stale if the note changed since. */
  async latest(actor: SessionUser, noteId: string): Promise<NoteAnalysisDto | null> {
    const userId = actor.id;
    const note = await this.load(actor, noteId);
    if (!note.aiAnalysis || !note.aiAnalysedAt) return null;
    const parsed = analysisSchema.safeParse(note.aiAnalysis);
    if (!parsed.success) return null;
    return {
      analysis: parsed.data,
      model: note.aiModel ?? "unknown",
      analysedAt: note.aiAnalysedAt.toISOString(),
      cached: true,
      stale: note.aiInputHash !== this.hashOf(note),
      redactions: null,
      remaining: Math.max(0, AI_DAILY_LIMIT - (await this.usedToday(userId))),
    };
  }

  async analyse(actor: SessionUser, noteId: string, force = false): Promise<NoteAnalysisDto> {
    const userId = actor.id;
    const note = await this.load(actor, noteId);
    if (note.contentText.trim().length < MIN_TEXT) {
      throw new BadRequestException("Write a little more in this note before analysing it.");
    }

    const hash = this.hashOf(note);
    if (!force && note.aiAnalysis && note.aiInputHash === hash && note.aiAnalysedAt) {
      const cached = analysisSchema.safeParse(note.aiAnalysis);
      if (cached.success) {
        return {
          analysis: cached.data,
          model: note.aiModel ?? "unknown",
          analysedAt: note.aiAnalysedAt.toISOString(),
          cached: true,
          stale: false,
          redactions: null,
          remaining: Math.max(0, AI_DAILY_LIMIT - (await this.usedToday(userId))),
        };
      }
    }

    const used = await this.usedToday(userId);
    if (used >= AI_DAILY_LIMIT) {
      throw new HttpException(
        `You've used all ${AI_DAILY_LIMIT} AI analyses for today. The limit resets at midnight (Sydney time).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Redact identifiers from BOTH title and body before anything leaves the server.
    const title = redact(note.title);
    const body = redact(aiTextOf(note));
    const counts = Object.fromEntries(
      Object.keys(body.counts).map((k) => [
        k,
        body.counts[k as keyof typeof body.counts] + title.counts[k as keyof typeof title.counts],
      ]),
    ) as typeof body.counts;

    const result = await this.client.analyse(
      buildUserPrompt({
        title: title.text,
        text: body.text,
        noteType: note.noteType,
        loanStage: note.loanStage,
        today: todayInSydney(),
        scheduled: scheduledOf(note),
      }),
    );
    await this.db.aiUsage.create({
      data: {
        userId,
        noteId,
        model: result.ok ? result.model : "error",
        ok: result.ok,
      },
    });
    if (!result.ok) throw new ServiceUnavailableException(result.error);
    await this.audit.record(actor, {
      action: "ai.analysed",
      summary: `Ran AI assist on “${displayTitle(note.title)}”`,
      entityType: "note",
      entityId: noteId,
      metadata: { model: result.model },
    });

    const analysedAt = new Date();
    await this.db.note.update({
      where: { id: noteId },
      data: {
        aiAnalysis: result.analysis as unknown as object,
        aiInputHash: hash,
        aiAnalysedAt: analysedAt,
        aiModel: result.model,
        // Analysing isn't editing: keep "last edited" exactly as it was.
        updatedAt: note.updatedAt,
      },
    });

    return {
      analysis: result.analysis as Analysis,
      model: result.model,
      analysedAt: analysedAt.toISOString(),
      cached: false,
      stale: false,
      redactions: counts,
      remaining: Math.max(0, AI_DAILY_LIMIT - used - 1),
    };
  }

  private async load(actor: SessionUser, noteId: string) {
    const note = await this.db.note.findFirst({
      where: { id: noteId, organisationId: actor.organisationId, deletedAt: null },
      select: {
        title: true,
        contentText: true,
        contentJson: true,
        meetingAt: true,
        followUpAt: true,
        noteType: true,
        loanStage: true,
        updatedAt: true,
        aiAnalysis: true,
        aiInputHash: true,
        aiAnalysedAt: true,
        aiModel: true,
      },
    });
    if (!note) throw new NotFoundException("Note not found");
    return note;
  }

  /** What the model sees — re-analyse when it changes (incl. ticking a checklist item). */
  private hashOf(
    n: Parameters<typeof aiTextOf>[0] & {
      title: string;
      noteType: string;
      loanStage: string | null;
      meetingAt: Date | null;
      followUpAt: Date | null;
    },
  ) {
    const s = scheduledOf(n);
    const text = `${aiTextOf(n)}\n${s.meeting ?? ""}|${s.followUp ?? ""}`;
    return sha256(analysisInput(n.title, text, n.noteType, n.loanStage));
  }

  /** Requests (successful or not) since midnight Sydney time — failed calls still used quota. */
  private usedToday(userId: string) {
    return this.db.aiUsage.count({
      where: { userId, createdAt: { gte: startOfZonedDay(new Date()) } },
    });
  }
}
