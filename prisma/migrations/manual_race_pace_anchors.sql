-- Optional race-pace anchors for relative pace targets (run/swim).
-- Safe to run multiple times.
ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "racePaceAnchors" JSONB;
