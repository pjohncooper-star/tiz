-- Persist per-week de-load flags (click overrides on de-load cadence chart)

ALTER TABLE "SeasonPlan"
  ADD COLUMN IF NOT EXISTS "deLoadWeekFlags" JSONB;
