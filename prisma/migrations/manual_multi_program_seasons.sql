-- Multiple overlapping programs per season: attachment ownership, clash
-- resolutions, calendar provenance, strength hours, max week hours.
-- Safe to re-run.
--
-- Run: npm run db:migrate:multi-program-seasons

ALTER TABLE "SeasonPlan" ADD COLUMN IF NOT EXISTS "maxWeekHours" DOUBLE PRECISION;
ALTER TABLE "SeasonPlan" ADD COLUMN IF NOT EXISTS "planSessionConflicts" JSONB;

ALTER TABLE "SeasonWeek" ADD COLUMN IF NOT EXISTS "strengthHours" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SeasonWeek" ADD COLUMN IF NOT EXISTS "strengthSessions" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SeasonTrainingPlanAttachment" ADD COLUMN IF NOT EXISTS "ownsDisciplines" JSONB;
ALTER TABLE "SeasonTrainingPlanAttachment" ADD COLUMN IF NOT EXISTS "fillLeftoverTiz" JSONB;

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "seasonTrainingPlanAttachmentId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlannedSession_seasonTrainingPlanAttachmentId_fkey'
  ) THEN
    ALTER TABLE "PlannedSession"
      ADD CONSTRAINT "PlannedSession_seasonTrainingPlanAttachmentId_fkey"
      FOREIGN KEY ("seasonTrainingPlanAttachmentId")
      REFERENCES "SeasonTrainingPlanAttachment"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PlannedSession_seasonTrainingPlanAttachmentId_idx"
  ON "PlannedSession"("seasonTrainingPlanAttachmentId");
