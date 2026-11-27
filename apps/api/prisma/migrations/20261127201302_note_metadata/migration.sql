-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('DISCOVERY', 'FACT_FIND', 'LENDER_RATIONALE', 'CONDITIONS', 'SETTLEMENT', 'REVIEW', 'GENERAL');

-- CreateEnum
CREATE TYPE "LoanStage" AS ENUM ('LEAD', 'PRE_APPROVAL', 'APPLICATION', 'CONDITIONAL', 'UNCONDITIONAL', 'SETTLED', 'REVIEW');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "loanStage" "LoanStage",
ADD COLUMN     "noteType" "NoteType" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Note_userId_followUpAt_idx" ON "Note"("userId", "followUpAt");
