-- Season planner: SeasonPlan, phases, mesocycles, weeks, goal events.
-- Run manually after deploying schema changes. Idempotent.

DO $$ BEGIN
  CREATE TYPE "SportTemplate" AS ENUM ('TRIATHLON');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SeasonStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PhaseKind" AS ENUM ('BASE', 'BUILD', 'RACE_PREP', 'TAPER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PhaseFocus" AS ENUM (
    'AEROBIC_BASE',
    'THRESHOLD',
    'VO2_MAX',
    'RACE_SPECIFICITY',
    'FRESHNESS',
    'STRENGTH_POWER',
    'MAINTENANCE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FocusMode" AS ENUM ('PHASE', 'DISCIPLINE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeLoadStrategy" AS ENUM (
    'VOLUME_ONLY',
    'VOLUME_AND_INTENSITY',
    'SINGLE_SPORT_FOCUS'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GoalEventDiscipline" AS ENUM ('SWIM', 'BIKE', 'RUN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventPriority" AS ENUM ('A', 'B', 'C');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SeasonPlan" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sportTemplate" "SportTemplate" NOT NULL DEFAULT 'TRIATHLON',
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "totalWeeks" INTEGER NOT NULL,
  "status" "SeasonStatus" NOT NULL DEFAULT 'DRAFT',
  "mesocycleLengthWeeks" INTEGER NOT NULL DEFAULT 4,
  "startHours" DOUBLE PRECISION NOT NULL,
  "peakHours" DOUBLE PRECISION NOT NULL,
  "maxRampPercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "deLoadEveryNWeeks" INTEGER NOT NULL DEFAULT 4,
  "deLoadVolumePercent" DOUBLE PRECISION NOT NULL DEFAULT 60,
  "deLoadStrategy" "DeLoadStrategy" NOT NULL DEFAULT 'VOLUME_ONLY',
  "reduceCountsOnDeLoad" BOOLEAN NOT NULL DEFAULT true,
  "deLoadCountScalePercent" DOUBLE PRECISION,
  "longRideStartMin" INTEGER NOT NULL DEFAULT 60,
  "longRidePeakMin" INTEGER NOT NULL DEFAULT 180,
  "longRunStartMin" INTEGER NOT NULL DEFAULT 30,
  "longRunPeakMin" INTEGER NOT NULL DEFAULT 90,
  "primaryGoalEventId" TEXT,
  "setupComplete" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeasonPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonPlan_primaryGoalEventId_key"
  ON "SeasonPlan"("primaryGoalEventId");

CREATE INDEX IF NOT EXISTS "SeasonPlan_athleteId_startDate_idx"
  ON "SeasonPlan"("athleteId", "startDate");

CREATE INDEX IF NOT EXISTS "SeasonPlan_athleteId_status_idx"
  ON "SeasonPlan"("athleteId", "status");

DO $$ BEGIN
  ALTER TABLE "SeasonPlan"
    ADD CONSTRAINT "SeasonPlan_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "GoalEvent" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "seasonPlanId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "discipline" "GoalEventDiscipline" NOT NULL,
  "priority" "EventPriority" NOT NULL DEFAULT 'A',
  "taperDaysBefore" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoalEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GoalEvent_athleteId_date_idx"
  ON "GoalEvent"("athleteId", "date");

CREATE INDEX IF NOT EXISTS "GoalEvent_seasonPlanId_idx"
  ON "GoalEvent"("seasonPlanId");

DO $$ BEGIN
  ALTER TABLE "GoalEvent"
    ADD CONSTRAINT "GoalEvent_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GoalEvent"
    ADD CONSTRAINT "GoalEvent_seasonPlanId_fkey"
    FOREIGN KEY ("seasonPlanId") REFERENCES "SeasonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SeasonPlan"
    ADD CONSTRAINT "SeasonPlan_primaryGoalEventId_fkey"
    FOREIGN KEY ("primaryGoalEventId") REFERENCES "GoalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SeasonPhase" (
  "id" TEXT NOT NULL,
  "seasonPlanId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "weekCount" INTEGER NOT NULL,
  "phaseKind" "PhaseKind" NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#38bdf8',
  "coachNotes" TEXT,
  "focusMode" "FocusMode" NOT NULL DEFAULT 'PHASE',
  "phaseFocus" "PhaseFocus",
  "swimSessionsPerWeek" INTEGER NOT NULL DEFAULT 3,
  "bikeSessionsPerWeek" INTEGER NOT NULL DEFAULT 4,
  "runSessionsPerWeek" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeasonPhase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeasonPhase_seasonPlanId_sortOrder_idx"
  ON "SeasonPhase"("seasonPlanId", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "SeasonPhase"
    ADD CONSTRAINT "SeasonPhase_seasonPlanId_fkey"
    FOREIGN KEY ("seasonPlanId") REFERENCES "SeasonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SeasonPhaseDiscipline" (
  "id" TEXT NOT NULL,
  "phaseId" TEXT NOT NULL,
  "discipline" "Discipline" NOT NULL,
  "focus" "PhaseFocus" NOT NULL,
  CONSTRAINT "SeasonPhaseDiscipline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonPhaseDiscipline_phaseId_discipline_key"
  ON "SeasonPhaseDiscipline"("phaseId", "discipline");

DO $$ BEGIN
  ALTER TABLE "SeasonPhaseDiscipline"
    ADD CONSTRAINT "SeasonPhaseDiscipline_phaseId_fkey"
    FOREIGN KEY ("phaseId") REFERENCES "SeasonPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SeasonMesocycle" (
  "id" TEXT NOT NULL,
  "phaseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "startWeekIndex" INTEGER NOT NULL,
  "endWeekIndex" INTEGER NOT NULL,
  CONSTRAINT "SeasonMesocycle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeasonMesocycle_phaseId_index_idx"
  ON "SeasonMesocycle"("phaseId", "index");

DO $$ BEGIN
  ALTER TABLE "SeasonMesocycle"
    ADD CONSTRAINT "SeasonMesocycle_phaseId_fkey"
    FOREIGN KEY ("phaseId") REFERENCES "SeasonPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SeasonWeek" (
  "id" TEXT NOT NULL,
  "seasonPlanId" TEXT NOT NULL,
  "weekIndex" INTEGER NOT NULL,
  "weekStartDate" DATE NOT NULL,
  "isDeLoadWeek" BOOLEAN NOT NULL DEFAULT false,
  "mesocycleId" TEXT,
  "totalHours" DOUBLE PRECISION NOT NULL,
  "swimHours" DOUBLE PRECISION NOT NULL,
  "bikeHours" DOUBLE PRECISION NOT NULL,
  "runHours" DOUBLE PRECISION NOT NULL,
  "zoneMinutes" JSONB NOT NULL,
  "swimSessions" INTEGER NOT NULL,
  "bikeSessions" INTEGER NOT NULL,
  "runSessions" INTEGER NOT NULL,
  "longRideMinutes" INTEGER NOT NULL,
  "longRunMinutes" INTEGER NOT NULL,
  CONSTRAINT "SeasonWeek_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonWeek_seasonPlanId_weekIndex_key"
  ON "SeasonWeek"("seasonPlanId", "weekIndex");

CREATE INDEX IF NOT EXISTS "SeasonWeek_seasonPlanId_weekStartDate_idx"
  ON "SeasonWeek"("seasonPlanId", "weekStartDate");

DO $$ BEGIN
  ALTER TABLE "SeasonWeek"
    ADD CONSTRAINT "SeasonWeek_seasonPlanId_fkey"
    FOREIGN KEY ("seasonPlanId") REFERENCES "SeasonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SeasonWeek"
    ADD CONSTRAINT "SeasonWeek_mesocycleId_fkey"
    FOREIGN KEY ("mesocycleId") REFERENCES "SeasonMesocycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AnchorWorkout" ADD COLUMN IF NOT EXISTS "seasonPlanId" TEXT;
ALTER TABLE "AnchorWorkout" ADD COLUMN IF NOT EXISTS "seasonPhaseId" TEXT;

CREATE INDEX IF NOT EXISTS "AnchorWorkout_seasonPlanId_idx"
  ON "AnchorWorkout"("seasonPlanId");

CREATE INDEX IF NOT EXISTS "AnchorWorkout_seasonPhaseId_idx"
  ON "AnchorWorkout"("seasonPhaseId");

DO $$ BEGIN
  ALTER TABLE "AnchorWorkout"
    ADD CONSTRAINT "AnchorWorkout_seasonPlanId_fkey"
    FOREIGN KEY ("seasonPlanId") REFERENCES "SeasonPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AnchorWorkout"
    ADD CONSTRAINT "AnchorWorkout_seasonPhaseId_fkey"
    FOREIGN KEY ("seasonPhaseId") REFERENCES "SeasonPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
