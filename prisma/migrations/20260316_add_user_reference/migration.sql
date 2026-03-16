-- AlterTable
ALTER TABLE "User" ADD COLUMN "reference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_reference_key" ON "User"("reference");

-- CreateIndex
CREATE INDEX "User_reference_idx" ON "User"("reference");
