-- Planning modes, long-session TiZ, phase planning fields (idempotent).

DO $$ BEGIN
  CREATE TYPE "PlanningMode" AS ENUM (
    'OVERALL',
    'BY_DISCIPLINE',
    'SEPARATE_LONGS',
    'SEPARATE_LONG_TIZ'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LongOffWeekPolicy" AS ENUM (
    'NONE',
    'EXTRA_INTENSITY',
    'ENDURANCE_PERCENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SeasonPlan"
  ADD COLUMN IF NOT EXISTS "defaultPlanningMode" "PlanningMode" NOT NULL DEFAULT 'BY_DISCIPLINE';

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "planningMode" "PlanningMode",
  ADD COLUMN IF NOT EXISTS "longRideOffWeekPolicy" "LongOffWeekPolicy" NOT NULL DEFAULT 'ENDURANCE_PERCENT',
  ADD COLUMN IF NOT EXISTS "longRunOffWeekPolicy" "LongOffWeekPolicy" NOT NULL DEFAULT 'ENDURANCE_PERCENT',
  ADD COLUMN IF NOT EXISTS "longRideOffWeekEndurancePercent" DOUBLE PRECISION NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "longRunOffWeekEndurancePercent" DOUBLE PRECISION NOT NULL DEFAULT 60;

ALTER TABLE "SeasonWeek"
  ADD COLUMN IF NOT EXISTS "longSessionZoneMinutes" JSONB,
  ADD COLUMN IF NOT EXISTS "slotBudgets" JSONB;
