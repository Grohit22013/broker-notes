-- Phase 8: organisations (multi-tenancy), roles, invites and the audit log.
--
-- Hand-edited so existing data migrates safely: every existing broker becomes the ADMIN of their own
-- new organisation, and their notes and clients move into it. Columns are added nullable,
-- backfilled, then made NOT NULL.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ADVISER', 'CASE_MANAGER');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- AlterTable (nullable first, backfilled below)
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3),
ADD COLUMN "organisationId" TEXT,
ADD COLUMN "role" "Role" NOT NULL DEFAULT 'ADVISER';
ALTER TABLE "Client" ADD COLUMN "assignedAdviserId" TEXT,
ADD COLUMN "organisationId" TEXT;
ALTER TABLE "Note" ADD COLUMN "organisationId" TEXT;

-- Backfill: one organisation per existing broker, who becomes its admin.
INSERT INTO "Organisation" ("id", "name", "createdAt", "updatedAt")
SELECT 'org_' || "id", "name" || '''s brokerage', "createdAt", CURRENT_TIMESTAMP FROM "User";
UPDATE "User" SET "organisationId" = 'org_' || "id", "role" = 'ADMIN';
UPDATE "Client" SET "organisationId" = 'org_' || "userId";
UPDATE "Note" SET "organisationId" = 'org_' || "userId";

ALTER TABLE "User" ALTER COLUMN "organisationId" SET NOT NULL;
ALTER TABLE "Client" ALTER COLUMN "organisationId" SET NOT NULL;
ALTER TABLE "Note" ALTER COLUMN "organisationId" SET NOT NULL;

-- DropIndex (scoping moves from the user to the organisation)
DROP INDEX "Client_userId_email_key";
DROP INDEX "Client_userId_name_idx";
DROP INDEX "Note_userId_deletedAt_updatedAt_idx";
DROP INDEX "Note_userId_followUpAt_idx";

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");
CREATE INDEX "Invite_organisationId_createdAt_idx" ON "Invite"("organisationId", "createdAt" DESC);
CREATE INDEX "AuditLog_organisationId_createdAt_idx" ON "AuditLog"("organisationId", "createdAt" DESC);
CREATE INDEX "AuditLog_organisationId_action_idx" ON "AuditLog"("organisationId", "action");
CREATE INDEX "Client_organisationId_name_idx" ON "Client"("organisationId", "name");
CREATE UNIQUE INDEX "Client_organisationId_email_key" ON "Client"("organisationId", "email");
CREATE INDEX "Note_organisationId_deletedAt_updatedAt_idx" ON "Note"("organisationId", "deletedAt", "updatedAt" DESC);
CREATE INDEX "Note_organisationId_followUpAt_idx" ON "Note"("organisationId", "followUpAt");
CREATE INDEX "Note_userId_idx" ON "Note"("userId");
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_assignedAdviserId_fkey" FOREIGN KEY ("assignedAdviserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
