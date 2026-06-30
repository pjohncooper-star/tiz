-- Race calendar sync: GoalEvent metrics, PlannedSession RACE source and linking

ALTER TYPE "PlannedSessionSource" ADD VALUE IF NOT EXISTS 'RACE';

ALTER TABLE "GoalEvent"
  ADD COLUMN IF NOT EXISTS "distanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "plannedSessionId" TEXT;

ALTER TABLE "PlannedSession"
  ADD COLUMN IF NOT EXISTS "goalEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "multisportGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "sessionIndex" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "GoalEvent_plannedSessionId_key"
  ON "GoalEvent"("plannedSessionId");

CREATE INDEX IF NOT EXISTS "PlannedSession_goalEventId_idx"
  ON "PlannedSession"("goalEventId");

CREATE INDEX IF NOT EXISTS "PlannedSession_multisportGroupId_idx"
  ON "PlannedSession"("multisportGroupId");

DO $$ BEGIN
  ALTER TABLE "GoalEvent"
    ADD CONSTRAINT "GoalEvent_plannedSessionId_fkey"
    FOREIGN KEY ("plannedSessionId") REFERENCES "PlannedSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlannedSession"
    ADD CONSTRAINT "PlannedSession_goalEventId_fkey"
    FOREIGN KEY ("goalEventId") REFERENCES "GoalEvent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
