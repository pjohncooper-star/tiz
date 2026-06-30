-- Dated primary metric preference for TiZ (Power vs LTHR on bike, Pace vs LTHR on run).
-- Run manually after deploying schema changes.

CREATE TABLE IF NOT EXISTS "SignalPreference" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "discipline" "Discipline" NOT NULL,
  "primarySignal" "SignalType" NOT NULL,
  "fallbackSignal" "SignalType",
  "effectiveDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SignalPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SignalPreference_athleteId_discipline_effectiveDate_key"
  ON "SignalPreference"("athleteId", "discipline", "effectiveDate");

CREATE INDEX IF NOT EXISTS "SignalPreference_athleteId_discipline_effectiveDate_idx"
  ON "SignalPreference"("athleteId", "discipline", "effectiveDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SignalPreference_athleteId_fkey'
  ) THEN
    ALTER TABLE "SignalPreference"
      ADD CONSTRAINT "SignalPreference_athleteId_fkey"
      FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill one preference row per athlete/discipline from current settings.
INSERT INTO "SignalPreference" (
  "id",
  "athleteId",
  "discipline",
  "primarySignal",
  "fallbackSignal",
  "effectiveDate",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  ads."athleteId",
  ads."discipline",
  ads."primarySignal",
  ads."fallbackSignal",
  COALESCE(
    (
      SELECT MIN(tp."effectiveDate")
      FROM "ThresholdProfile" tp
      WHERE tp."athleteId" = ads."athleteId"
        AND tp."discipline" = ads."discipline"
    ),
    a."createdAt"::date
  ),
  NOW()
FROM "AthleteDisciplineSettings" ads
JOIN "Athlete" a ON a."id" = ads."athleteId"
WHERE ads."discipline" IN ('BIKE', 'RUN', 'SWIM')
  AND NOT EXISTS (
    SELECT 1
    FROM "SignalPreference" sp
    WHERE sp."athleteId" = ads."athleteId"
      AND sp."discipline" = ads."discipline"
  );
