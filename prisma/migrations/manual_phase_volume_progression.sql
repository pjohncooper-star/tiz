-- Phase-owned volume progression: target / percent / absolute step

DO $$ BEGIN
  CREATE TYPE "VolumeProgressionMode" AS ENUM ('TARGET', 'PERCENT', 'STEP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "volumeProgressionMode" "VolumeProgressionMode",
  ADD COLUMN IF NOT EXISTS "volumeStepHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimStepHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "bikeStepHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runStepHours" DOUBLE PRECISION;
