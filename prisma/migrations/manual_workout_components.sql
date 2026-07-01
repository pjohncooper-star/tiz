-- Workout component library (replaces unused ReusableSegment)

DROP TABLE IF EXISTS "ReusableSegment";

DROP TYPE IF EXISTS "SegmentType";

CREATE TYPE "ComponentType" AS ENUM (
  'WARMUP',
  'PRIMER',
  'MAIN_SET',
  'COOLDOWN',
  'DRILL',
  'RECOVERY',
  'OTHER'
);

CREATE TABLE "WorkoutComponent" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "discipline" "Discipline" NOT NULL,
  "componentType" "ComponentType" NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "steps" JSONB NOT NULL,
  "lastCompletedAt" TIMESTAMP(3),
  "lastCompletedSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkoutComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComponentProgressionStep" (
  "id" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "steps" JSONB NOT NULL,

  CONSTRAINT "ComponentProgressionStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionComponentInstance" (
  "id" TEXT NOT NULL,
  "plannedSessionId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "progressionStepId" TEXT,
  "paletteOrderIndex" INTEGER NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionComponentInstance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkoutComponent_athleteId_discipline_componentType_idx"
  ON "WorkoutComponent"("athleteId", "discipline", "componentType");

ALTER TABLE "WorkoutComponent"
  ADD CONSTRAINT "WorkoutComponent_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutComponent"
  ADD CONSTRAINT "WorkoutComponent_lastCompletedSessionId_fkey"
  FOREIGN KEY ("lastCompletedSessionId") REFERENCES "PlannedSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ComponentProgressionStep"
  ADD CONSTRAINT "ComponentProgressionStep_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "WorkoutComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ComponentProgressionStep_componentId_orderIndex_key"
  ON "ComponentProgressionStep"("componentId", "orderIndex");

ALTER TABLE "SessionComponentInstance"
  ADD CONSTRAINT "SessionComponentInstance_plannedSessionId_fkey"
  FOREIGN KEY ("plannedSessionId") REFERENCES "PlannedSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionComponentInstance"
  ADD CONSTRAINT "SessionComponentInstance_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "WorkoutComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionComponentInstance"
  ADD CONSTRAINT "SessionComponentInstance_progressionStepId_fkey"
  FOREIGN KEY ("progressionStepId") REFERENCES "ComponentProgressionStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SessionComponentInstance_plannedSessionId_idx"
  ON "SessionComponentInstance"("plannedSessionId");

CREATE INDEX "SessionComponentInstance_componentId_idx"
  ON "SessionComponentInstance"("componentId");
