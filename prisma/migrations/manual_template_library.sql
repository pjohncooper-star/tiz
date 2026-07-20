-- Reusable weekly template library.
--
-- Supersedes the plan/phase-scoped model from manual_phase_templates.sql:
-- WeeklyScheduleTemplate becomes an athlete-owned library entry, and seasons
-- reference templates by id (phase.weeklyTemplateId, plan.rest/testWeekTemplateId)
-- so a template can be reused across phases and seasons.
--
-- Idempotent and self-sufficient: safe to run repeatedly, and works whether or
-- not manual_phase_templates.sql was previously applied.

-- 0. Ensure the enum + base table shape exist (no-ops on migrated DBs) ---------
DO $$ BEGIN
  CREATE TYPE "WeeklyTemplateKind" AS ENUM ('DEFAULT', 'PHASE', 'REST', 'TEST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The original model made one template per athlete; the library allows many.
ALTER TABLE "WeeklyScheduleTemplate"
  DROP CONSTRAINT IF EXISTS "WeeklyScheduleTemplate_athleteId_key";
DROP INDEX IF EXISTS "WeeklyScheduleTemplate_athleteId_key";

-- 1. Drop the plan/phase scoping added by manual_phase_templates.sql ----------
DROP INDEX IF EXISTS "WeeklyScheduleTemplate_default_per_athlete";
DROP INDEX IF EXISTS "WeeklyScheduleTemplate_rest_per_plan";
DROP INDEX IF EXISTS "WeeklyScheduleTemplate_test_per_plan";
DROP INDEX IF EXISTS "WeeklyScheduleTemplate_seasonPhaseId_key";
DROP INDEX IF EXISTS "WeeklyScheduleTemplate_seasonPlanId_idx";

ALTER TABLE "WeeklyScheduleTemplate"
  DROP CONSTRAINT IF EXISTS "WeeklyScheduleTemplate_seasonPlanId_fkey";
ALTER TABLE "WeeklyScheduleTemplate"
  DROP CONSTRAINT IF EXISTS "WeeklyScheduleTemplate_seasonPhaseId_fkey";

ALTER TABLE "WeeklyScheduleTemplate" DROP COLUMN IF EXISTS "seasonPlanId";
ALTER TABLE "WeeklyScheduleTemplate" DROP COLUMN IF EXISTS "seasonPhaseId";

-- 2. Rename kind -> category (the scope tag becomes an organizing label) ------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WeeklyScheduleTemplate' AND column_name = 'kind'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WeeklyScheduleTemplate' AND column_name = 'category'
  ) THEN
    ALTER TABLE "WeeklyScheduleTemplate" RENAME COLUMN "kind" TO "category";
  END IF;
END $$;

ALTER TABLE "WeeklyScheduleTemplate"
  ADD COLUMN IF NOT EXISTS "category" "WeeklyTemplateKind" NOT NULL DEFAULT 'DEFAULT';

CREATE INDEX IF NOT EXISTS "WeeklyScheduleTemplate_athleteId_idx"
  ON "WeeklyScheduleTemplate" ("athleteId");

-- 3. Reference columns on the season side ------------------------------------
ALTER TABLE "SeasonPhase" ADD COLUMN IF NOT EXISTS "weeklyTemplateId" TEXT;
ALTER TABLE "SeasonPlan"  ADD COLUMN IF NOT EXISTS "restWeekTemplateId" TEXT;
ALTER TABLE "SeasonPlan"  ADD COLUMN IF NOT EXISTS "testWeekTemplateId" TEXT;

DO $$ BEGIN
  ALTER TABLE "SeasonPhase"
    ADD CONSTRAINT "SeasonPhase_weeklyTemplateId_fkey"
    FOREIGN KEY ("weeklyTemplateId") REFERENCES "WeeklyScheduleTemplate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SeasonPlan"
    ADD CONSTRAINT "SeasonPlan_restWeekTemplateId_fkey"
    FOREIGN KEY ("restWeekTemplateId") REFERENCES "WeeklyScheduleTemplate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SeasonPlan"
    ADD CONSTRAINT "SeasonPlan_testWeekTemplateId_fkey"
    FOREIGN KEY ("testWeekTemplateId") REFERENCES "WeeklyScheduleTemplate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "SeasonPhase_weeklyTemplateId_idx"
  ON "SeasonPhase" ("weeklyTemplateId");
CREATE INDEX IF NOT EXISTS "SeasonPlan_restWeekTemplateId_idx"
  ON "SeasonPlan" ("restWeekTemplateId");
CREATE INDEX IF NOT EXISTS "SeasonPlan_testWeekTemplateId_idx"
  ON "SeasonPlan" ("testWeekTemplateId");
