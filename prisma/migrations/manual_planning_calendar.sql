-- Planning calendar: weekly template + TEMPLATE session source.
-- Run after existing migrations.

DO $$ BEGIN
  ALTER TYPE "PlannedSessionSource" ADD VALUE 'TEMPLATE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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
EXCEPTION
  WHEN duplicate_object THEN NULL;
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
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "weeklyTemplateItemId" TEXT;

DO $$ BEGIN
  ALTER TABLE "PlannedSession"
    ADD CONSTRAINT "PlannedSession_weeklyTemplateItemId_fkey"
    FOREIGN KEY ("weeklyTemplateItemId") REFERENCES "WeeklyScheduleTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
