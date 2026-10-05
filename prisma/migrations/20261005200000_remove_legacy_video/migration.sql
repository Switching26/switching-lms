-- Refuse retirement if an existing video has no playable replacement or duration.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Chapter" WHERE "videoUrl" IS NOT NULL AND
    ("videoR2Key" IS NULL OR "videoR2Key" = '' OR "videoDuration" <= 0)) THEN
    RAISE EXCEPTION 'An active video is missing its private package or duration';
  END IF;
END $$;
ALTER TABLE "Chapter" DROP COLUMN "videoUrl", DROP COLUMN "videoVimeoDuration";
DELETE FROM "SystemConfig" WHERE key = 'vimeo_token';
