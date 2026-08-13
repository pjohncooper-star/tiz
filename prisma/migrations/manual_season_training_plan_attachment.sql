-- Season-owned training plan attachments (idempotent)
-- Safe to re-run.
--
-- Run: npm run db:migrate:season-training-plan

CREATE TABLE IF NOT EXISTS "SeasonTrainingPlanAttachment" (
  "id" TEXT NOT NULL,
  "seasonPlanId" TEXT NOT NULL,
  "trainingPlanId" TEXT NOT NULL,
  "anchorMode" TEXT NOT NULL,
  "anchorDate" DATE NOT NULL,
  "goalEventId" TEXT,
  "pausedWeeks" JSONB NOT NULL DEFAULT '[]',
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "truncateOffset" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeasonTrainingPlanAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeasonTrainingPlanAttachment_seasonPlanId_idx"
  ON "SeasonTrainingPlanAttachment"("seasonPlanId");

CREATE INDEX IF NOT EXISTS "SeasonTrainingPlanAttachment_trainingPlanId_idx"
  ON "SeasonTrainingPlanAttachment"("trainingPlanId");

CREATE INDEX IF NOT EXISTS "SeasonTrainingPlanAttachment_goalEventId_idx"
  ON "SeasonTrainingPlanAttachment"("goalEventId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SeasonTrainingPlanAttachment_seasonPlanId_fkey'
  ) THEN
    ALTER TABLE "SeasonTrainingPlanAttachment"
      ADD CONSTRAINT "SeasonTrainingPlanAttachment_seasonPlanId_fkey"
      FOREIGN KEY ("seasonPlanId") REFERENCES "SeasonPlan"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SeasonTrainingPlanAttachment_trainingPlanId_fkey'
  ) THEN
    ALTER TABLE "SeasonTrainingPlanAttachment"
      ADD CONSTRAINT "SeasonTrainingPlanAttachment_trainingPlanId_fkey"
      FOREIGN KEY ("trainingPlanId") REFERENCES "TrainingPlan"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SeasonTrainingPlanAttachment_goalEventId_fkey'
  ) THEN
    ALTER TABLE "SeasonTrainingPlanAttachment"
      ADD CONSTRAINT "SeasonTrainingPlanAttachment_goalEventId_fkey"
      FOREIGN KEY ("goalEventId") REFERENCES "GoalEvent"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
