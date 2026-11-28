-- Phase 11: note revisions (conflict detection), favourites and brokerage templates. Additive only.
-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "NoteFavourite" (
    "userId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteFavourite_pkey" PRIMARY KEY ("userId","noteId")
);

-- CreateTable
CREATE TABLE "OrgTemplate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "noteType" "NoteType" NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "OrgTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteFavourite_noteId_idx" ON "NoteFavourite"("noteId");

-- CreateIndex
CREATE INDEX "OrgTemplate_organisationId_archivedAt_idx" ON "OrgTemplate"("organisationId", "archivedAt");

-- AddForeignKey
ALTER TABLE "NoteFavourite" ADD CONSTRAINT "NoteFavourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteFavourite" ADD CONSTRAINT "NoteFavourite_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTemplate" ADD CONSTRAINT "OrgTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTemplate" ADD CONSTRAINT "OrgTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

