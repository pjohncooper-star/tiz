-- Store explicit week span start for phases (supports gaps / unassigned weeks)

ALTER TABLE "SeasonPhase"
  ADD COLUMN IF NOT EXISTS "startWeekIndex" INTEGER NOT NULL DEFAULT 0;

-- Backfill: cumulative week offsets per season (legacy contiguous layout)
WITH ranked AS (
  SELECT
    id,
    SUM(weekCount) OVER (
      PARTITION BY "seasonPlanId"
      ORDER BY "sortOrder"
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prior_weeks
  FROM "SeasonPhase"
  WHERE "weekCount" > 0
)
UPDATE "SeasonPhase" sp
SET "startWeekIndex" = COALESCE(r.prior_weeks, 0)
FROM ranked r
WHERE sp.id = r.id;
