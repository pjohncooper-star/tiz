-- Link completed activities to planned sessions (manual drag-and-drop matching).
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "linkedActivityId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PlannedSession_linkedActivityId_key"
  ON "PlannedSession"("linkedActivityId");

DO $$ BEGIN
  ALTER TABLE "PlannedSession"
    ADD CONSTRAINT "PlannedSession_linkedActivityId_fkey"
    FOREIGN KEY ("linkedActivityId") REFERENCES "SyncedActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
