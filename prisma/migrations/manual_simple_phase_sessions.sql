-- Simple planner: per-phase session frequency (including strength)

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "strengthSessionsPerWeek" INTEGER NOT NULL DEFAULT 2;
