-- Athlete-level max HR for % of max workout targets.
-- Safe to run multiple times.
ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "maxHeartRateBpm" INTEGER;
