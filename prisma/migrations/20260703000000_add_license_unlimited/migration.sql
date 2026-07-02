-- Allow selected partners to enroll learners without a license ceiling.
ALTER TABLE "License" ADD COLUMN "isUnlimited" BOOLEAN NOT NULL DEFAULT false;
