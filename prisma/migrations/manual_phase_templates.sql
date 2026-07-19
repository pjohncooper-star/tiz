-- Phase-aware weekly templates.
--
-- Turns the athlete-global WeeklyScheduleTemplate into a plan-scoped, typed
-- model (DEFAULT | PHASE | REST | TEST) and adds scheduled test-week flags on
-- the season plan. Idempotent: safe to run repeatedly and against a DB that was
-- built incrementally with the other manual_*.sql files.
--
-- Backward compatible: existing rows become kind = 'DEFAULT' (athlete-global),
-- so the /calendar/template quick-apply keeps working unchanged.

-- 1. Template kind enum -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "WeeklyTemplateKind" AS ENUM ('DEFAULT', 'PHASE', 'REST', 'TEST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. New columns on WeeklyScheduleTemplate ------------------------------------
ALTER TABLE "WeeklyScheduleTemplate"
  ADD COLUMN IF NOT EXISTS "kind" "WeeklyTemplateKind" NOT NULL DEFAULT 'DEFAULT';
ALTER TABLE "WeeklyScheduleTemplate"
  ADD COLUMN IF NOT EXISTS "seasonPlanId" TEXT;
ALTER TABLE "WeeklyScheduleTemplate"
  ADD COLUMN IF NOT EXISTS "seasonPhaseId" TEXT;

-- 3. Drop the old one-per-athlete unique (now many templates per athlete) -----
ALTER TABLE "WeeklyScheduleTemplate"
  DROP CONSTRAINT IF EXISTS "WeeklyScheduleTemplate_athleteId_key";
DROP INDEX IF EXISTS "WeeklyScheduleTemplate_athleteId_key";

-- 4. Foreign keys to plan / phase --------------------------------------------
DO $$ BEGIN
  ALTER TABLE "WeeklyScheduleTemplate"
    ADD CONSTRAINT "WeeklyScheduleTemplate_seasonPlanId_fkey"
    FOREIGN KEY ("seasonPlanId") REFERENCES "SeasonPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "WeeklyScheduleTemplate"
    ADD CONSTRAINT "WeeklyScheduleTemplate_seasonPhaseId_fkey"
    FOREIGN KEY ("seasonPhaseId") REFERENCES "SeasonPhase"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 5. Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "WeeklyScheduleTemplate_athleteId_idx"
  ON "WeeklyScheduleTemplate" ("athleteId");
CREATE INDEX IF NOT EXISTS "WeeklyScheduleTemplate_seasonPlanId_idx"
  ON "WeeklyScheduleTemplate" ("seasonPlanId");

-- One PHASE template per phase (matches Prisma @unique on seasonPhaseId;
-- NULLs are distinct in Postgres, so DEFAULT/REST/TEST rows are unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyScheduleTemplate_seasonPhaseId_key"
  ON "WeeklyScheduleTemplate" ("seasonPhaseId");

-- Partial uniques Prisma cannot express: at most one DEFAULT per athlete and
-- at most one REST / TEST template per season plan.
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyScheduleTemplate_default_per_athlete"
  ON "WeeklyScheduleTemplate" ("athleteId") WHERE "kind" = 'DEFAULT';
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyScheduleTemplate_rest_per_plan"
  ON "WeeklyScheduleTemplate" ("seasonPlanId") WHERE "kind" = 'REST';
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyScheduleTemplate_test_per_plan"
  ON "WeeklyScheduleTemplate" ("seasonPlanId") WHERE "kind" = 'TEST';

-- 6. Scheduled test-week flags on the season plan ----------------------------
ALTER TABLE "SeasonPlan"
  ADD COLUMN IF NOT EXISTS "testWeekFlags" JSONB;
