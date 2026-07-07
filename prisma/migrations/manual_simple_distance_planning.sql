-- Simple planner: distance planning + zone ramp defaults

DO $$ BEGIN
  CREATE TYPE "VolumePlanningMode" AS ENUM ('HOURS', 'DISTANCE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SeasonPlan"
  ADD COLUMN IF NOT EXISTS "swimPlanningMode" "VolumePlanningMode" NOT NULL DEFAULT 'HOURS',
  ADD COLUMN IF NOT EXISTS "runPlanningMode" "VolumePlanningMode" NOT NULL DEFAULT 'HOURS',
  ADD COLUMN IF NOT EXISTS "swimReferencePaceSeconds" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runReferencePaceSeconds" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimStartDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimPeakDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runStartDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runPeakDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "zoneRampDefaultsByDiscipline" JSONB;

ALTER TABLE "SeasonWeek"
  ADD COLUMN IF NOT EXISTS "swimDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "zoneMinutesOverridden" BOOLEAN NOT NULL DEFAULT false;
