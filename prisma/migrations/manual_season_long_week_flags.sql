-- Per-week long ride/run tier flags (true = full, false = medium)

ALTER TABLE "SeasonPlan"
  ADD COLUMN IF NOT EXISTS "longRideWeekFlags" JSONB;

ALTER TABLE "SeasonPlan"
  ADD COLUMN IF NOT EXISTS "longRunWeekFlags" JSONB;
