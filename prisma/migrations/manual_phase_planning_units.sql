-- Per-phase planning units: optional swim/run hours-or-distance mode and reference pace.
-- Empty columns inherit the season's planning units.

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "swimPlanningMode" "VolumePlanningMode",
  ADD COLUMN IF NOT EXISTS "runPlanningMode" "VolumePlanningMode",
  ADD COLUMN IF NOT EXISTS "swimReferencePaceSeconds" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "runReferencePaceSeconds" DOUBLE PRECISION;
