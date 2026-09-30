-- Formula mix and V1 workout shape on weekly template slots.
-- Shares are percent of that sport's weekly clock. Null share = duration-based.

DO $$ BEGIN
  CREATE TYPE "WorkoutShapeKind" AS ENUM ('STEADY', 'FIXED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "WeeklyScheduleTemplateItem"
  ADD COLUMN IF NOT EXISTS "sharePercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "zone" INTEGER,
  ADD COLUMN IF NOT EXISTS "shapeKind" "WorkoutShapeKind",
  ADD COLUMN IF NOT EXISTS "workSeconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "restSeconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "minReps" INTEGER,
  ADD COLUMN IF NOT EXISTS "warmupSeconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "cooldownSeconds" INTEGER;
