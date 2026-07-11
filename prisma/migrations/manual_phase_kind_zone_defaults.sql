-- Phase-kind zone split defaults for simple season planner

ALTER TABLE "SeasonPlan"
  ADD COLUMN IF NOT EXISTS "phaseKindZoneDefaults" JSONB;
