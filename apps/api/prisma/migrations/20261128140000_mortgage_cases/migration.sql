-- Phase 9: mortgage cases (nine-stage pipeline) and the note → case link. Additive only.
-- CreateEnum
CREATE TYPE "CaseStage" AS ENUM ('ENQUIRY', 'FACT_FIND', 'RESEARCH', 'RECOMMENDATION', 'LODGED', 'ASSESSMENT', 'APPROVED', 'SETTLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('FIRST_HOME', 'PURCHASE', 'REFINANCE', 'INVESTMENT', 'TOP_UP', 'CONSTRUCTION', 'PRODUCT_SWITCH');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "caseId" TEXT;

-- CreateTable
CREATE TABLE "MortgageCase" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "CaseType" NOT NULL,
    "stage" "CaseStage" NOT NULL DEFAULT 'ENQUIRY',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lender" TEXT,
    "lenderReference" TEXT,
    "loanAmount" INTEGER,
    "propertyValue" INTEGER,
    "assignedAdviserId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MortgageCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MortgageCase_organisationId_stage_idx" ON "MortgageCase"("organisationId", "stage");

-- CreateIndex
CREATE INDEX "MortgageCase_clientId_idx" ON "MortgageCase"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "MortgageCase_organisationId_reference_key" ON "MortgageCase"("organisationId", "reference");

-- CreateIndex
CREATE INDEX "Note_caseId_idx" ON "Note"("caseId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "MortgageCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageCase" ADD CONSTRAINT "MortgageCase_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageCase" ADD CONSTRAINT "MortgageCase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageCase" ADD CONSTRAINT "MortgageCase_assignedAdviserId_fkey" FOREIGN KEY ("assignedAdviserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageCase" ADD CONSTRAINT "MortgageCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

