-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "Partner" ADD COLUMN "smtpPort" INTEGER;
ALTER TABLE "Partner" ADD COLUMN "smtpEmail" TEXT;
ALTER TABLE "Partner" ADD COLUMN "smtpPassword" TEXT;
ALTER TABLE "Partner" ADD COLUMN "smtpFromName" TEXT;
ALTER TABLE "Partner" ADD COLUMN "useDefaultSmtp" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN "subject" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN "error" TEXT;
