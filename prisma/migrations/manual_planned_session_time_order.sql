-- Optional scheduled wall-clock time + within-day sort order for planned sessions.
-- Also adds private calendar feed token on Athlete.

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "scheduledTimeMinutes" INTEGER;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "daySortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "PlannedSession_athleteId_scheduledDate_daySortOrder_idx"
  ON "PlannedSession"("athleteId", "scheduledDate", "daySortOrder");

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "calendarFeedToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Athlete_calendarFeedToken_key"
  ON "Athlete"("calendarFeedToken");
