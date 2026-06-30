-- Session-reported completion (manual entry and overrides)
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedDurationMinutes" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedDistanceMeters" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedTargetSpeedMps" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedTargetPaceSeconds" DOUBLE PRECISION;
ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "completedZones" JSONB;
