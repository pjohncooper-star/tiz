-- Recovery settings and per-week volume override for unified season planner

ALTER TABLE "SeasonPlan"
  ADD COLUMN IF NOT EXISTS "recoveryLoadWeeks" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "recoveryZoneMode" TEXT NOT NULL DEFAULT 'proportional',
  ADD COLUMN IF NOT EXISTS "recoveryHighZoneCutPercent" DOUBLE PRECISION NOT NULL DEFAULT 50;

ALTER TABLE "SeasonWeek"
  ADD COLUMN IF NOT EXISTS "volumeOverridden" BOOLEAN NOT NULL DEFAULT false;
