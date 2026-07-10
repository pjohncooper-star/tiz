-- Session role for planned sessions, anchors, and weekly template items.

DO $$ BEGIN
  CREATE TYPE "SessionRole" AS ENUM ('EASY', 'MODERATE', 'INTENSITY', 'LONG');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PlannedSession"
  ADD COLUMN IF NOT EXISTS "sessionRole" "SessionRole" NOT NULL DEFAULT 'MODERATE';

ALTER TABLE "AnchorWorkout"
  ADD COLUMN IF NOT EXISTS "sessionRole" "SessionRole" NOT NULL DEFAULT 'MODERATE';

ALTER TABLE "WeeklyScheduleTemplateItem"
  ADD COLUMN IF NOT EXISTS "sessionRole" "SessionRole" NOT NULL DEFAULT 'MODERATE';
