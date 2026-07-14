-- ECO (Objective Load Equivalents) athlete preference + activity scores

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "ecoLoadEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SyncedActivity" ADD COLUMN IF NOT EXISTS "ecos" DOUBLE PRECISION;
ALTER TABLE "SyncedActivity" ADD COLUMN IF NOT EXISTS "ecoZoneMinutes" JSONB;
ALTER TABLE "SyncedActivity" ADD COLUMN IF NOT EXISTS "ecoComputed" BOOLEAN NOT NULL DEFAULT false;
