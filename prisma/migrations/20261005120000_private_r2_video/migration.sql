-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "videoR2Key" TEXT,
ADD COLUMN     "videoVimeoDuration" INTEGER;

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "multipartId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "hlsKey" TEXT,
    "duration" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoJob_status_createdAt_idx" ON "VideoJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VideoJob_chapterId_idx" ON "VideoJob"("chapterId");
