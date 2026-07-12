-- Athlete-level default zone focus by phase kind (Base/Build/Race prep/Taper).
-- Used when creating new simple season plans.

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "phaseKindZoneDefaults" JSONB;
