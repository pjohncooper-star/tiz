-- User training plans (idempotent)
-- Safe to re-run.
--
-- Run: npm run db:migrate:training-plans
-- Or paste into Neon SQL editor.

-- ---------------------------------------------------------------------------
-- 1. Extend PlannedSessionSource with PLAN
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE "PlannedSessionSource" ADD VALUE IF NOT EXISTS 'PLAN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- Fallback for Postgres versions without ADD VALUE IF NOT EXISTS
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PlannedSessionSource' AND e.enumlabel = 'PLAN'
  ) THEN
    ALTER TYPE "PlannedSessionSource" ADD VALUE 'PLAN';
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. TrainingPlan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TrainingPlan" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "durationDays" INTEGER NOT NULL,
  "sessionCount" INTEGER NOT NULL,
  "anchorWeekday" "Weekday" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrainingPlan_athleteId_name_key"
  ON "TrainingPlan"("athleteId", "name");

CREATE INDEX IF NOT EXISTS "TrainingPlan_athleteId_updatedAt_idx"
  ON "TrainingPlan"("athleteId", "updatedAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TrainingPlan_athleteId_fkey'
  ) THEN
    ALTER TABLE "TrainingPlan"
      ADD CONSTRAINT "TrainingPlan_athleteId_fkey"
      FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. TrainingPlanSession
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TrainingPlanSession" (
  "id" TEXT NOT NULL,
  "trainingPlanId" TEXT NOT NULL,
  "dayOffset" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "discipline" "Discipline" NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "sessionRole" "SessionRole" NOT NULL DEFAULT 'MODERATE',
  "estimatedDurationMinutes" INTEGER,
  "distanceMeters" DOUBLE PRECISION,
  "targetSpeedMps" DOUBLE PRECISION,
  "targetPaceSeconds" DOUBLE PRECISION,
  "poolSize" "PoolSize",
  "steps" JSONB,
  CONSTRAINT "TrainingPlanSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrainingPlanSession_trainingPlanId_dayOffset_sortOrder_idx"
  ON "TrainingPlanSession"("trainingPlanId", "dayOffset", "sortOrder");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TrainingPlanSession_trainingPlanId_fkey'
  ) THEN
    ALTER TABLE "TrainingPlanSession"
      ADD CONSTRAINT "TrainingPlanSession_trainingPlanId_fkey"
      FOREIGN KEY ("trainingPlanId") REFERENCES "TrainingPlan"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. PlannedSession.trainingPlanId
-- ---------------------------------------------------------------------------
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "trainingPlanId" TEXT;

CREATE INDEX IF NOT EXISTS "PlannedSession_athleteId_trainingPlanId_scheduledDate_idx"
  ON "PlannedSession"("athleteId", "trainingPlanId", "scheduledDate");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlannedSession_trainingPlanId_fkey'
  ) THEN
    ALTER TABLE "PlannedSession"
      ADD CONSTRAINT "PlannedSession_trainingPlanId_fkey"
      FOREIGN KEY ("trainingPlanId") REFERENCES "TrainingPlan"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
