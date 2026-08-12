-- Provenance: which library session an applied calendar session came from.
-- Safe to run multiple times.
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "trainingPlanSessionId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlannedSession_trainingPlanSessionId_fkey'
  ) THEN
    ALTER TABLE "PlannedSession"
      ADD CONSTRAINT "PlannedSession_trainingPlanSessionId_fkey"
      FOREIGN KEY ("trainingPlanSessionId")
      REFERENCES "TrainingPlanSession"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PlannedSession_trainingPlanSessionId_idx"
  ON "PlannedSession"("trainingPlanSessionId");
