-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('DRAFT', 'FINALISED');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "finalisedAt" TIMESTAMP(3),
ADD COLUMN     "keyFigures" JSONB,
ADD COLUMN     "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteAmendment" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_userId_name_idx" ON "Client"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_email_key" ON "Client"("userId", "email");

-- CreateIndex
CREATE INDEX "NoteAmendment_noteId_createdAt_idx" ON "NoteAmendment"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_clientId_idx" ON "Note"("clientId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAmendment" ADD CONSTRAINT "NoteAmendment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
