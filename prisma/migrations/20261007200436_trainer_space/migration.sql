-- CreateEnum
CREATE TYPE "TrainerSessionStatus" AS ENUM ('PLANNED', 'DONE', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailType" ADD VALUE 'TRAINER_NEW_STUDENT';
ALTER TYPE "EmailType" ADD VALUE 'TRAINER_NEW_MESSAGE';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TRAINER';

-- CreateTable
CREATE TABLE "TrainerAssignment" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "learnerId" TEXT,
    "enrollmentId" TEXT,
    "crmBeneficiaireId" INTEGER,
    "civility" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "formationLabel" TEXT NOT NULL,
    "visioHours" INTEGER,
    "hasElearning" BOOLEAN NOT NULL DEFAULT false,
    "adminStartAt" TIMESTAMP(3) NOT NULL,
    "adminEndAt" TIMESTAMP(3),
    "visioStartAt" TIMESTAMP(3),
    "contactDoneAt" TIMESTAMP(3),
    "silaeAccessSentAt" TIMESTAMP(3),
    "planningAgreedAt" TIMESTAMP(3),
    "planningNote" TEXT,
    "noAnswerAt" TIMESTAMP(3),
    "trainerNotifiedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerSession" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "TrainerSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAssignment_enrollmentId_key" ON "TrainerAssignment"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAssignment_crmBeneficiaireId_key" ON "TrainerAssignment"("crmBeneficiaireId");

-- CreateIndex
CREATE INDEX "TrainerAssignment_trainerId_idx" ON "TrainerAssignment"("trainerId");

-- CreateIndex
CREATE INDEX "TrainerAssignment_learnerId_idx" ON "TrainerAssignment"("learnerId");

-- CreateIndex
CREATE INDEX "TrainerSession_assignmentId_startsAt_idx" ON "TrainerSession"("assignmentId", "startsAt");

-- AddForeignKey
ALTER TABLE "TrainerAssignment" ADD CONSTRAINT "TrainerAssignment_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAssignment" ADD CONSTRAINT "TrainerAssignment_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAssignment" ADD CONSTRAINT "TrainerAssignment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerSession" ADD CONSTRAINT "TrainerSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainerAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
