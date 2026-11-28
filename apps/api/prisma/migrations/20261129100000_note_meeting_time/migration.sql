-- Phase 12: when a note's meeting took place (for the calendar). Additive only.
-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "meetingAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Note_organisationId_meetingAt_idx" ON "Note"("organisationId", "meetingAt");

