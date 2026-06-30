-- Phase 2: PlannedBlock -> WeeklyPlan (idempotent)
-- Safe to re-run. "does not exist, skipping" NOTICEs from DROP IF EXISTS are normal.
--
-- Run in Neon SQL editor, then verify with prisma/migrations/verify_weekly_plan.sql

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "WeeklyPlanMode" AS ENUM ('MODE_1_TOTAL', 'MODE_2_DISCIPLINE', 'MODE_3_TIZ');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WeeklyPlanSource" AS ENUM ('PHASE_CASCADE', 'MANUAL_OVERRIDE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlannedSessionSource" AS ENUM ('FLEXIBLE', 'ANCHORED_INSTANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. PlannedBlock -> WeeklyPlan
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public."PlannedBlock"') IS NOT NULL
     AND to_regclass('public."WeeklyPlan"') IS NULL THEN
    ALTER TABLE "PlannedBlock" RENAME TO "WeeklyPlan";
  END IF;
END $$;

-- Fresh DB with neither table: create WeeklyPlan (matches prisma schema)
CREATE TABLE IF NOT EXISTS "WeeklyPlan" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "discipline" "Discipline" NOT NULL,
  "zone" INTEGER NOT NULL,
  "targetMinutes" DOUBLE PRECISION NOT NULL,
  "weeklyPlanWeekId" TEXT,
  "source" "WeeklyPlanSource" NOT NULL DEFAULT 'MANUAL_OVERRIDE',
  CONSTRAINT "WeeklyPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyPlan_athleteId_weekStart_discipline_zone_key"
  ON "WeeklyPlan"("athleteId", "weekStart", "discipline", "zone");

ALTER TABLE "WeeklyPlan" ADD COLUMN IF NOT EXISTS "source" "WeeklyPlanSource";
UPDATE "WeeklyPlan" SET "source" = 'MANUAL_OVERRIDE' WHERE "source" IS NULL;
ALTER TABLE "WeeklyPlan" ALTER COLUMN "source" SET DEFAULT 'MANUAL_OVERRIDE';
ALTER TABLE "WeeklyPlan" ALTER COLUMN "source" SET NOT NULL;

ALTER TABLE "WeeklyPlan" ADD COLUMN IF NOT EXISTS "weeklyPlanWeekId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyPlan_athleteId_fkey'
  ) THEN
    ALTER TABLE "WeeklyPlan"
      ADD CONSTRAINT "WeeklyPlan_athleteId_fkey"
      FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. WeeklyPlanWeek
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "WeeklyPlanWeek" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "mode" "WeeklyPlanMode" NOT NULL DEFAULT 'MODE_2_DISCIPLINE',
  "totalHoursTarget" DOUBLE PRECISION,
  "disciplineHours" JSONB,
  CONSTRAINT "WeeklyPlanWeek_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyPlanWeek_athleteId_weekStart_key"
  ON "WeeklyPlanWeek"("athleteId", "weekStart");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyPlanWeek_athleteId_fkey'
  ) THEN
    ALTER TABLE "WeeklyPlanWeek"
      ADD CONSTRAINT "WeeklyPlanWeek_athleteId_fkey"
      FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyPlan_weeklyPlanWeekId_fkey'
  ) THEN
    ALTER TABLE "WeeklyPlan"
      ADD CONSTRAINT "WeeklyPlan_weeklyPlanWeekId_fkey"
      FOREIGN KEY ("weeklyPlanWeekId") REFERENCES "WeeklyPlanWeek"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill week metadata for weeks that already have zone rows
INSERT INTO "WeeklyPlanWeek" ("id", "athleteId", "weekStart", "mode")
SELECT
  'wpw_' || substr(md5(w."athleteId" || ':' || w."weekStart"::text), 1, 24),
  w."athleteId",
  w."weekStart",
  'MODE_3_TIZ'::"WeeklyPlanMode"
FROM (SELECT DISTINCT "athleteId", "weekStart" FROM "WeeklyPlan") AS w
WHERE NOT EXISTS (
  SELECT 1 FROM "WeeklyPlanWeek" wpw
  WHERE wpw."athleteId" = w."athleteId" AND wpw."weekStart" = w."weekStart"
);

UPDATE "WeeklyPlan" wp
SET "weeklyPlanWeekId" = wpw."id"
FROM "WeeklyPlanWeek" wpw
WHERE wp."athleteId" = wpw."athleteId"
  AND wp."weekStart" = wpw."weekStart"
  AND wp."weeklyPlanWeekId" IS NULL;

-- ---------------------------------------------------------------------------
-- 4. PlannedSession
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PlannedSession' AND column_name = 'plannedBlockId'
  ) THEN
    ALTER TABLE "PlannedSession" RENAME COLUMN "plannedBlockId" TO "weeklyPlanId";
  END IF;
END $$;

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "weeklyPlanId" TEXT;

ALTER TABLE "PlannedSession" DROP CONSTRAINT IF EXISTS "PlannedSession_plannedBlockId_fkey";

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlannedSession_weeklyPlanId_fkey'
  ) THEN
    ALTER TABLE "PlannedSession"
      ADD CONSTRAINT "PlannedSession_weeklyPlanId_fkey"
      FOREIGN KEY ("weeklyPlanId") REFERENCES "WeeklyPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "source" "PlannedSessionSource";
UPDATE "PlannedSession" SET "source" = 'FLEXIBLE' WHERE "source" IS NULL;
ALTER TABLE "PlannedSession" ALTER COLUMN "source" SET DEFAULT 'FLEXIBLE';
ALTER TABLE "PlannedSession" ALTER COLUMN "source" SET NOT NULL;

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "zoneAllocationMissing" BOOLEAN;
UPDATE "PlannedSession" SET "zoneAllocationMissing" = false WHERE "zoneAllocationMissing" IS NULL;
ALTER TABLE "PlannedSession" ALTER COLUMN "zoneAllocationMissing" SET DEFAULT false;
ALTER TABLE "PlannedSession" ALTER COLUMN "zoneAllocationMissing" SET NOT NULL;

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "distanceMeters" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "targetSpeedMps" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "targetPaceSeconds" DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- 5. StructuredWorkout
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'StructuredWorkout' AND column_name = 'plannedBlockId'
  ) THEN
    ALTER TABLE "StructuredWorkout" RENAME COLUMN "plannedBlockId" TO "weeklyPlanId";
  END IF;
END $$;

ALTER TABLE "StructuredWorkout" ADD COLUMN IF NOT EXISTS "weeklyPlanId" TEXT;

ALTER TABLE "StructuredWorkout" DROP CONSTRAINT IF EXISTS "StructuredWorkout_plannedBlockId_fkey";

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StructuredWorkout_weeklyPlanId_fkey'
  ) THEN
    ALTER TABLE "StructuredWorkout"
      ADD CONSTRAINT "StructuredWorkout_weeklyPlanId_fkey"
      FOREIGN KEY ("weeklyPlanId") REFERENCES "WeeklyPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
