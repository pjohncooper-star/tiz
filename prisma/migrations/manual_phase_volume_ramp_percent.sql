-- Optional per-phase total ramp % (start + ramp → end when volumeEndHours is null)

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "volumeRampPercent" DOUBLE PRECISION;
