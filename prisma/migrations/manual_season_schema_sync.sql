-- Season planner schema sync (idempotent).
-- Adds all SeasonPlan / SeasonWeek / SeasonPhase / GoalEvent columns used by the
-- unified simple season planner. Run when season create/save fails with missing
-- column errors.
--
-- If base tables are missing, run manual_season_planner.sql first, or:
--   node scripts/sync-db-schema.mjs --season-only

-- ---------------------------------------------------------------------------
-- Enums (safe if already created by manual_season_planner.sql)
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE "SportTemplate" AS ENUM ('TRIATHLON'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SeasonStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PhaseKind" AS ENUM ('BASE', 'BUILD', 'RACE_PREP', 'TAPER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PhaseFocus" AS ENUM ('AEROBIC_BASE', 'THRESHOLD', 'VO2_MAX', 'RACE_SPECIFICITY', 'FRESHNESS', 'STRENGTH_POWER', 'MAINTENANCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FocusMode" AS ENUM ('PHASE', 'DISCIPLINE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DeLoadStrategy" AS ENUM ('VOLUME_ONLY', 'VOLUME_AND_INTENSITY', 'SINGLE_SPORT_FOCUS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "GoalEventDiscipline" AS ENUM ('SWIM', 'BIKE', 'RUN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EventPriority" AS ENUM ('A', 'B', 'C'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VolumePlanningMode" AS ENUM ('HOURS', 'DISTANCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VolumeMesocycleMode" AS ENUM ('INCREASE', 'HOLD', 'DECREASE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- SeasonPlan columns
-- ---------------------------------------------------------------------------
ALTER TABLE "SeasonPlan"
  ADD COLUMN IF NOT EXISTS "swimSplitPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "bikeSplitPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runSplitPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimStartHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimPeakHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimRampPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "bikeStartHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "bikePeakHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "bikeRampPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runStartHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runPeakHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runRampPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimPlanningMode" "VolumePlanningMode",
  ADD COLUMN IF NOT EXISTS "runPlanningMode" "VolumePlanningMode",
  ADD COLUMN IF NOT EXISTS "swimReferencePaceSeconds" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runReferencePaceSeconds" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimStartDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimPeakDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runStartDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runPeakDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "zoneRampDefaultsByDiscipline" JSONB,
  ADD COLUMN IF NOT EXISTS "recoveryLoadWeeks" INTEGER,
  ADD COLUMN IF NOT EXISTS "recoveryZoneMode" TEXT,
  ADD COLUMN IF NOT EXISTS "recoveryHighZoneCutPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "deLoadWeekFlags" JSONB,
  ADD COLUMN IF NOT EXISTS "longRideWeekFlags" JSONB,
  ADD COLUMN IF NOT EXISTS "longRunWeekFlags" JSONB;

UPDATE "SeasonPlan" SET "swimPlanningMode" = 'HOURS' WHERE "swimPlanningMode" IS NULL;
UPDATE "SeasonPlan" SET "runPlanningMode" = 'HOURS' WHERE "runPlanningMode" IS NULL;
UPDATE "SeasonPlan" SET "recoveryLoadWeeks" = 3 WHERE "recoveryLoadWeeks" IS NULL;
UPDATE "SeasonPlan" SET "recoveryZoneMode" = 'proportional' WHERE "recoveryZoneMode" IS NULL;
UPDATE "SeasonPlan" SET "recoveryHighZoneCutPercent" = 50 WHERE "recoveryHighZoneCutPercent" IS NULL;

ALTER TABLE "SeasonPlan" ALTER COLUMN "swimPlanningMode" SET DEFAULT 'HOURS';
ALTER TABLE "SeasonPlan" ALTER COLUMN "runPlanningMode" SET DEFAULT 'HOURS';
ALTER TABLE "SeasonPlan" ALTER COLUMN "recoveryLoadWeeks" SET DEFAULT 3;
ALTER TABLE "SeasonPlan" ALTER COLUMN "recoveryZoneMode" SET DEFAULT 'proportional';
ALTER TABLE "SeasonPlan" ALTER COLUMN "recoveryHighZoneCutPercent" SET DEFAULT 50;

-- ---------------------------------------------------------------------------
-- SeasonWeek columns
-- ---------------------------------------------------------------------------
ALTER TABLE "SeasonWeek"
  ADD COLUMN IF NOT EXISTS "swimDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "zoneMinutesOverridden" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "volumeOverridden" BOOLEAN;

UPDATE "SeasonWeek" SET "zoneMinutesOverridden" = false WHERE "zoneMinutesOverridden" IS NULL;
UPDATE "SeasonWeek" SET "volumeOverridden" = false WHERE "volumeOverridden" IS NULL;
ALTER TABLE "SeasonWeek" ALTER COLUMN "zoneMinutesOverridden" SET DEFAULT false;
ALTER TABLE "SeasonWeek" ALTER COLUMN "volumeOverridden" SET DEFAULT false;

-- ---------------------------------------------------------------------------
-- SeasonPhase columns
-- ---------------------------------------------------------------------------
ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "startWeekIndex" INTEGER,
  ADD COLUMN IF NOT EXISTS "rampSwimEnabled" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "rampBikeEnabled" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "rampRunEnabled" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "volumeMesocycleMode" "VolumeMesocycleMode",
  ADD COLUMN IF NOT EXISTS "volumeStartHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "volumeEndHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "volumeRampPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimStartHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimEndHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "swimRampPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "bikeStartHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "bikeEndHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "bikeRampPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runStartHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runEndHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runRampPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longRideStartMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "longRideEndMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "longRunStartMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "longRunEndMin" INTEGER;

UPDATE "SeasonPhase" SET "startWeekIndex" = 0 WHERE "startWeekIndex" IS NULL;
UPDATE "SeasonPhase" SET "rampSwimEnabled" = true WHERE "rampSwimEnabled" IS NULL;
UPDATE "SeasonPhase" SET "rampBikeEnabled" = true WHERE "rampBikeEnabled" IS NULL;
UPDATE "SeasonPhase" SET "rampRunEnabled" = true WHERE "rampRunEnabled" IS NULL;
UPDATE "SeasonPhase" SET "volumeMesocycleMode" = 'INCREASE' WHERE "volumeMesocycleMode" IS NULL;

ALTER TABLE "SeasonPhase" ALTER COLUMN "startWeekIndex" SET DEFAULT 0;
ALTER TABLE "SeasonPhase" ALTER COLUMN "rampSwimEnabled" SET DEFAULT true;
ALTER TABLE "SeasonPhase" ALTER COLUMN "rampBikeEnabled" SET DEFAULT true;
ALTER TABLE "SeasonPhase" ALTER COLUMN "rampRunEnabled" SET DEFAULT true;
ALTER TABLE "SeasonPhase" ALTER COLUMN "volumeMesocycleMode" SET DEFAULT 'INCREASE';

-- ---------------------------------------------------------------------------
-- SeasonMesocycle columns
-- ---------------------------------------------------------------------------
ALTER TABLE "SeasonMesocycle"
  ADD COLUMN IF NOT EXISTS "swimSplitPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "bikeSplitPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runSplitPercent" DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- GoalEvent columns (multisport + calendar link)
-- ---------------------------------------------------------------------------
ALTER TABLE "GoalEvent"
  ADD COLUMN IF NOT EXISTS "disciplines" "GoalEventDiscipline"[],
  ADD COLUMN IF NOT EXISTS "distanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "plannedSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "swimGoalMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "bikeGoalMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "runGoalMinutes" INTEGER;

-- Migrate legacy single discipline column if present
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'GoalEvent' AND column_name = 'discipline'
  ) THEN
    UPDATE "GoalEvent"
    SET "disciplines" = ARRAY["discipline"]::"GoalEventDiscipline"[]
    WHERE "disciplines" IS NULL AND "discipline" IS NOT NULL;
    ALTER TABLE "GoalEvent" DROP COLUMN IF EXISTS "discipline";
  END IF;
END $$;

UPDATE "GoalEvent"
SET "disciplines" = ARRAY[]::"GoalEventDiscipline"[]
WHERE "disciplines" IS NULL;

DO $$ BEGIN
  ALTER TABLE "GoalEvent" ALTER COLUMN "disciplines" SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "GoalEvent_plannedSessionId_key"
  ON "GoalEvent"("plannedSessionId");

DO $$ BEGIN
  ALTER TABLE "GoalEvent"
    ADD CONSTRAINT "GoalEvent_plannedSessionId_fkey"
    FOREIGN KEY ("plannedSessionId") REFERENCES "PlannedSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
