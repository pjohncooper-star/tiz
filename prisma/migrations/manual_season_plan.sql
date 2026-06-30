-- Season / periodization schema (idempotent). Run in Neon SQL editor after manual_weekly_plan.sql.

DO $$ BEGIN
  CREATE TYPE "EventPriority" AS ENUM ('A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GoalEventDiscipline" AS ENUM ('BIKE', 'RUN', 'SWIM', 'MULTISPORT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MesocycleObjective" AS ENUM (
    'BUILD_VOLUME', 'INCREASE_INTENSITY', 'MAINTAIN', 'RECOVER', 'TAPER', 'SPORT_EMPHASIS'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WeeklyProposalStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Macrocycle" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "primaryGoalEventId" TEXT,
  "name" TEXT,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Macrocycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Macrocycle_primaryGoalEventId_key"
  ON "Macrocycle"("primaryGoalEventId");
CREATE INDEX IF NOT EXISTS "Macrocycle_athleteId_startDate_idx"
  ON "Macrocycle"("athleteId", "startDate");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Macrocycle_athleteId_fkey') THEN
    ALTER TABLE "Macrocycle"
      ADD CONSTRAINT "Macrocycle_athleteId_fkey"
      FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "GoalEvent" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "macrocycleId" TEXT,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "discipline" "GoalEventDiscipline" NOT NULL,
  "priority" "EventPriority" NOT NULL,
  "taperDaysBefore" INTEGER,
  "applyMiniTaper" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GoalEvent_athleteId_date_idx" ON "GoalEvent"("athleteId", "date");
CREATE INDEX IF NOT EXISTS "GoalEvent_macrocycleId_idx" ON "GoalEvent"("macrocycleId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GoalEvent_athleteId_fkey') THEN
    ALTER TABLE "GoalEvent"
      ADD CONSTRAINT "GoalEvent_athleteId_fkey"
      FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GoalEvent_macrocycleId_fkey') THEN
    ALTER TABLE "GoalEvent"
      ADD CONSTRAINT "GoalEvent_macrocycleId_fkey"
      FOREIGN KEY ("macrocycleId") REFERENCES "Macrocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Macrocycle_primaryGoalEventId_fkey') THEN
    ALTER TABLE "Macrocycle"
      ADD CONSTRAINT "Macrocycle_primaryGoalEventId_fkey"
      FOREIGN KEY ("primaryGoalEventId") REFERENCES "GoalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Mesocycle" (
  "id" TEXT NOT NULL,
  "macrocycleId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phaseType" TEXT,
  "objective" "MesocycleObjective" NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "params" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mesocycle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Mesocycle_macrocycleId_startDate_idx"
  ON "Mesocycle"("macrocycleId", "startDate");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Mesocycle_macrocycleId_fkey') THEN
    ALTER TABLE "Mesocycle"
      ADD CONSTRAINT "Mesocycle_macrocycleId_fkey"
      FOREIGN KEY ("macrocycleId") REFERENCES "Macrocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Microcycle" (
  "id" TEXT NOT NULL,
  "mesocycleId" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "index" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Microcycle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Microcycle_mesocycleId_startDate_idx"
  ON "Microcycle"("mesocycleId", "startDate");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Microcycle_mesocycleId_fkey') THEN
    ALTER TABLE "Microcycle"
      ADD CONSTRAINT "Microcycle_mesocycleId_fkey"
      FOREIGN KEY ("mesocycleId") REFERENCES "Mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "WeeklyProposal" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "mesocycleId" TEXT,
  "microcycleId" TEXT,
  "status" "WeeklyProposalStatus" NOT NULL DEFAULT 'PROPOSED',
  "mode" "WeeklyPlanMode" NOT NULL DEFAULT 'MODE_2_DISCIPLINE',
  "totalHoursTarget" DOUBLE PRECISION,
  "disciplineHours" JSONB,
  "zoneTargets" JSONB,
  "modifierNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyProposal_athleteId_weekStart_key"
  ON "WeeklyProposal"("athleteId", "weekStart");
CREATE INDEX IF NOT EXISTS "WeeklyProposal_mesocycleId_idx" ON "WeeklyProposal"("mesocycleId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyProposal_athleteId_fkey') THEN
    ALTER TABLE "WeeklyProposal"
      ADD CONSTRAINT "WeeklyProposal_athleteId_fkey"
      FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyProposal_mesocycleId_fkey') THEN
    ALTER TABLE "WeeklyProposal"
      ADD CONSTRAINT "WeeklyProposal_mesocycleId_fkey"
      FOREIGN KEY ("mesocycleId") REFERENCES "Mesocycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyProposal_microcycleId_fkey') THEN
    ALTER TABLE "WeeklyProposal"
      ADD CONSTRAINT "WeeklyProposal_microcycleId_fkey"
      FOREIGN KEY ("microcycleId") REFERENCES "Microcycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AnchorWorkout" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "macrocycleId" TEXT,
  "workoutTemplateId" TEXT,
  "title" TEXT NOT NULL,
  "discipline" "Discipline" NOT NULL,
  "weekday" "Weekday" NOT NULL,
  "durationMinutes" INTEGER,
  "distanceMeters" DOUBLE PRECISION,
  "targetSpeedMps" DOUBLE PRECISION,
  "targetPaceSeconds" DOUBLE PRECISION,
  "targetZones" JSONB,
  "steps" JSONB,
  "effectiveFrom" DATE NOT NULL,
  "effectiveUntil" DATE,
  "respectTaper" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "skippedDates" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnchorWorkout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AnchorWorkout_athleteId_weekday_idx"
  ON "AnchorWorkout"("athleteId", "weekday");
CREATE INDEX IF NOT EXISTS "AnchorWorkout_macrocycleId_idx" ON "AnchorWorkout"("macrocycleId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AnchorWorkout_athleteId_fkey') THEN
    ALTER TABLE "AnchorWorkout"
      ADD CONSTRAINT "AnchorWorkout_athleteId_fkey"
      FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AnchorWorkout_macrocycleId_fkey') THEN
    ALTER TABLE "AnchorWorkout"
      ADD CONSTRAINT "AnchorWorkout_macrocycleId_fkey"
      FOREIGN KEY ("macrocycleId") REFERENCES "Macrocycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AnchorWorkout_workoutTemplateId_fkey') THEN
    ALTER TABLE "AnchorWorkout"
      ADD CONSTRAINT "AnchorWorkout_workoutTemplateId_fkey"
      FOREIGN KEY ("workoutTemplateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "anchorWorkoutId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlannedSession_anchorWorkoutId_fkey') THEN
    ALTER TABLE "PlannedSession"
      ADD CONSTRAINT "PlannedSession_anchorWorkoutId_fkey"
      FOREIGN KEY ("anchorWorkoutId") REFERENCES "AnchorWorkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PlannedSession_athleteId_anchorWorkoutId_scheduledDate_key"
  ON "PlannedSession"("athleteId", "anchorWorkoutId", "scheduledDate");
