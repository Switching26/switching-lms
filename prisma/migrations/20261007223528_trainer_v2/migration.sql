-- CreateEnum
CREATE TYPE "TrainerContactKind" AS ENUM ('CONTACT', 'RELANCE', 'REPONSE', 'PLANNING_VALIDE', 'PAS_DE_RETOUR', 'ACCES_SILAE_ENVOYE', 'NOTE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailType" ADD VALUE 'SESSION_SCHEDULED';
ALTER TYPE "EmailType" ADD VALUE 'SESSION_UPDATED';
ALTER TYPE "EmailType" ADD VALUE 'SESSION_CANCELLED';
ALTER TYPE "EmailType" ADD VALUE 'SESSION_REMINDER';
ALTER TYPE "EmailType" ADD VALUE 'ELEARNING_ADDED';

-- AlterTable
ALTER TABLE "TrainerAssignment" ADD COLUMN     "partnerId" TEXT;

-- AlterTable
ALTER TABLE "TrainerSession" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "visioUrl" TEXT;

-- CreateTable
CREATE TABLE "TrainerContactEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "kind" "TrainerContactKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerContactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerUnavailability" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerPartner" (
    "trainerId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerPartner_pkey" PRIMARY KEY ("trainerId","partnerId")
);

-- CreateIndex
CREATE INDEX "TrainerContactEvent_assignmentId_occurredAt_idx" ON "TrainerContactEvent"("assignmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "TrainerUnavailability_trainerId_startsAt_idx" ON "TrainerUnavailability"("trainerId", "startsAt");

-- CreateIndex
CREATE INDEX "TrainerAssignment_partnerId_idx" ON "TrainerAssignment"("partnerId");

-- AddForeignKey
ALTER TABLE "TrainerAssignment" ADD CONSTRAINT "TrainerAssignment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerContactEvent" ADD CONSTRAINT "TrainerContactEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainerAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerContactEvent" ADD CONSTRAINT "TrainerContactEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerUnavailability" ADD CONSTRAINT "TrainerUnavailability_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerPartner" ADD CONSTRAINT "TrainerPartner_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerPartner" ADD CONSTRAINT "TrainerPartner_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the V1 trainer perimeter. This is compatibility data only: no
-- import of Laetitia's current students/planning (Samuel R9/R10).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "role" = 'TRAINER')
    AND NOT EXISTS (SELECT 1 FROM "Partner" WHERE "slug" = 'switching' AND "isInternal" = true)
  THEN
    RAISE EXCEPTION 'Trainer V2 requires the existing internal Switching partner before migrating trainers';
  END IF;
END $$;

INSERT INTO "TrainerPartner" ("trainerId", "partnerId", "createdAt")
SELECT u."id", p."id", CURRENT_TIMESTAMP
FROM "User" u CROSS JOIN "Partner" p
WHERE u."role" = 'TRAINER' AND p."slug" = 'switching' AND p."isInternal" = true
ON CONFLICT ("trainerId", "partnerId") DO NOTHING;

UPDATE "TrainerAssignment" a SET "partnerId" = COALESCE(
  (SELECT u."partnerId" FROM "User" u WHERE u."id" = a."learnerId"),
  (SELECT p."id" FROM "Partner" p WHERE p."slug" = 'switching' AND p."isInternal" = true)
) WHERE a."partnerId" IS NULL;

-- Preserve the four V1 timestamps by representing them in the new history.
-- Subsequent recomputation must not erase existing V1 progress.
INSERT INTO "TrainerContactEvent" ("id", "assignmentId", "kind", "occurredAt", "createdById", "createdAt")
SELECT 'v2-contact-' || md5(a."id" || ':' || e.kind), a."id",
  e.kind::"TrainerContactKind", e.at, a."trainerId", CURRENT_TIMESTAMP
FROM "TrainerAssignment" a CROSS JOIN LATERAL (VALUES
  ('CONTACT', a."contactDoneAt"), ('PLANNING_VALIDE', a."planningAgreedAt"),
  ('PAS_DE_RETOUR', a."noAnswerAt"), ('ACCES_SILAE_ENVOYE', a."silaeAccessSentAt")
) AS e(kind, at) WHERE e.at IS NOT NULL;

UPDATE "TrainerSession" SET "cancelledAt" = "updatedAt"
WHERE "status" = 'CANCELLED' AND "cancelledAt" IS NULL;
