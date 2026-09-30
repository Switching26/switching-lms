-- Nullable: historical visits cannot be dated retroactively.
ALTER TABLE "Progress" ADD COLUMN "lastAccessedAt" TIMESTAMP(3);
