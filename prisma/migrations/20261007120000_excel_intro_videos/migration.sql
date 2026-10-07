-- Additive only: no existing column or data is modified.
CREATE TABLE "IntroVideo" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT,
    "sectionId" TEXT,
    "videoKey" TEXT NOT NULL,
    "posterKey" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntroVideo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntroVideo_one_target" CHECK (("chapterId" IS NOT NULL)::integer + ("sectionId" IS NOT NULL)::integer = 1),
    CONSTRAINT "IntroVideo_positive_duration" CHECK ("durationSeconds" > 0)
);
CREATE UNIQUE INDEX "IntroVideo_chapterId_key" ON "IntroVideo"("chapterId");
CREATE UNIQUE INDEX "IntroVideo_sectionId_key" ON "IntroVideo"("sectionId");
ALTER TABLE "IntroVideo" ADD CONSTRAINT "IntroVideo_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntroVideo" ADD CONSTRAINT "IntroVideo_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
