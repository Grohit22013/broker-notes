import type { LoanStage, NoteType } from "@prisma/client";
import type { LoanStageValue, NoteTypeValue } from "@broker-notes/shared/notes/taxonomy";

/**
 * Compile-time guard: `tsc` fails if the shared (client-safe) taxonomy lists drift from the
 * Prisma enums. Each direction must be assignable to the other.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const noteTypesMatchPrisma: Same<NoteType, NoteTypeValue> = true;
export const loanStagesMatchPrisma: Same<LoanStage, LoanStageValue> = true;
