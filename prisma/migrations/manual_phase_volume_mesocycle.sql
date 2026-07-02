-- Per-phase mesocycle volume ramp mode and optional start/end targets

DO $$ BEGIN
  CREATE TYPE "VolumeMesocycleMode" AS ENUM ('INCREASE', 'HOLD', 'DECREASE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "volumeMesocycleMode" "VolumeMesocycleMode" NOT NULL DEFAULT 'INCREASE';

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "volumeStartHours" DOUBLE PRECISION;

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "volumeEndHours" DOUBLE PRECISION;

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "longRideStartMin" INTEGER;

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "longRideEndMin" INTEGER;

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "longRunStartMin" INTEGER;

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "longRunEndMin" INTEGER;
