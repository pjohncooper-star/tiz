-- Calendar + PlannedSession schema sync (idempotent).
-- Run when /calendar fails with "column does not exist" on PlannedSession.
--
-- Option A (recommended for local dev):
--   npx prisma db push && npx prisma generate
--
-- Option B (incremental Neon DB):
--   npx prisma db execute --file prisma/migrations/manual_calendar_schema_sync.sql --schema prisma/schema.prisma
--   npx prisma generate
--
-- Safe to re-run. "duplicate_object" / "already exists" notices are normal.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "PoolSize" AS ENUM ('SCY', 'SCM', 'LCM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SessionRole" AS ENUM ('EASY', 'MODERATE', 'INTENSITY', 'LONG');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlannedSessionSource" AS ENUM ('FLEXIBLE', 'ANCHORED_INSTANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "PlannedSessionSource" ADD VALUE 'TEMPLATE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "PlannedSessionSource" ADD VALUE 'RACE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Weekly schedule template (planning calendar)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "WeeklyScheduleTemplate" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Weekly template',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyScheduleTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyScheduleTemplate_athleteId_key"
  ON "WeeklyScheduleTemplate"("athleteId");

DO $$ BEGIN
  ALTER TABLE "WeeklyScheduleTemplate"
    ADD CONSTRAINT "WeeklyScheduleTemplate_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WeeklyScheduleTemplateItem" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "weekday" "Weekday" NOT NULL,
  "discipline" "Discipline" NOT NULL,
  "title" TEXT NOT NULL,
  "durationMinutes" INTEGER,
  "distanceMeters" DOUBLE PRECISION,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "WeeklyScheduleTemplateItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WeeklyScheduleTemplateItem_templateId_weekday_sortOrder_idx"
  ON "WeeklyScheduleTemplateItem"("templateId", "weekday", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "WeeklyScheduleTemplateItem"
    ADD CONSTRAINT "WeeklyScheduleTemplateItem_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "WeeklyScheduleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "WeeklyScheduleTemplateItem"
  ADD COLUMN IF NOT EXISTS "sessionRole" "SessionRole" NOT NULL DEFAULT 'MODERATE';

ALTER TABLE "WeeklyScheduleTemplateItem"
  ADD COLUMN IF NOT EXISTS "poolSize" "PoolSize";

-- ---------------------------------------------------------------------------
-- PlannedSession columns (calendar + weekly plan + race sync + completion)
-- ---------------------------------------------------------------------------
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "weeklyTemplateItemId" TEXT;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "source" "PlannedSessionSource";
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "zoneAllocationMissing" BOOLEAN;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "distanceMeters" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "targetSpeedMps" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "targetPaceSeconds" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "poolSize" "PoolSize";
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "goalEventId" TEXT;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "multisportGroupId" TEXT;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "sessionIndex" INTEGER;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "linkedActivityId" TEXT;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedDurationMinutes" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedDistanceMeters" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedTargetSpeedMps" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedTargetPaceSeconds" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedZones" JSONB;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "sessionRole" "SessionRole" NOT NULL DEFAULT 'MODERATE';

UPDATE "PlannedSession" SET "source" = 'FLEXIBLE' WHERE "source" IS NULL;
ALTER TABLE "PlannedSession" ALTER COLUMN "source" SET DEFAULT 'FLEXIBLE';
ALTER TABLE "PlannedSession" ALTER COLUMN "source" SET NOT NULL;

UPDATE "PlannedSession" SET "zoneAllocationMissing" = false WHERE "zoneAllocationMissing" IS NULL;
ALTER TABLE "PlannedSession" ALTER COLUMN "zoneAllocationMissing" SET DEFAULT false;
ALTER TABLE "PlannedSession" ALTER COLUMN "zoneAllocationMissing" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- GoalEvent race-calendar columns
-- ---------------------------------------------------------------------------
ALTER TABLE "GoalEvent"
  ADD COLUMN IF NOT EXISTS "distanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "plannedSessionId" TEXT;

-- ---------------------------------------------------------------------------
-- Indexes + foreign keys
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "PlannedSession_linkedActivityId_key"
  ON "PlannedSession"("linkedActivityId");

CREATE INDEX IF NOT EXISTS "PlannedSession_goalEventId_idx"
  ON "PlannedSession"("goalEventId");

CREATE INDEX IF NOT EXISTS "PlannedSession_multisportGroupId_idx"
  ON "PlannedSession"("multisportGroupId");

CREATE UNIQUE INDEX IF NOT EXISTS "GoalEvent_plannedSessionId_key"
  ON "GoalEvent"("plannedSessionId");

DO $$ BEGIN
  ALTER TABLE "PlannedSession"
    ADD CONSTRAINT "PlannedSession_weeklyTemplateItemId_fkey"
    FOREIGN KEY ("weeklyTemplateItemId") REFERENCES "WeeklyScheduleTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlannedSession"
    ADD CONSTRAINT "PlannedSession_goalEventId_fkey"
    FOREIGN KEY ("goalEventId") REFERENCES "GoalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlannedSession"
    ADD CONSTRAINT "PlannedSession_linkedActivityId_fkey"
    FOREIGN KEY ("linkedActivityId") REFERENCES "SyncedActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GoalEvent"
    ADD CONSTRAINT "GoalEvent_plannedSessionId_fkey"
    FOREIGN KEY ("plannedSessionId") REFERENCES "PlannedSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
