-- TrainerRoad calendar ingest: private ICS URL on Athlete, external UID on PlannedSession.

ALTER TYPE "PlannedSessionSource" ADD VALUE IF NOT EXISTS 'TRAINERROAD';

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "trainerRoadIcalUrl" TEXT;
ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "trainerRoadSyncedAt" TIMESTAMP(3);

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "externalUid" TEXT;

CREATE INDEX IF NOT EXISTS "PlannedSession_athleteId_source_externalUid_idx"
  ON "PlannedSession"("athleteId", "source", "externalUid");

CREATE UNIQUE INDEX IF NOT EXISTS "PlannedSession_trainerRoad_externalUid_key"
  ON "PlannedSession"("athleteId", "externalUid")
  WHERE "source" = 'TRAINERROAD' AND "externalUid" IS NOT NULL;
