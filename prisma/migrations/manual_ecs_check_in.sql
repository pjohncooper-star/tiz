-- Daily ECS (Equivalentes de Carga Subjetiva) end-of-day check-ins

CREATE TABLE IF NOT EXISTS "DailyEcsCheckIn" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "ecs" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyEcsCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyEcsCheckIn_athleteId_date_key"
  ON "DailyEcsCheckIn"("athleteId", "date");

CREATE INDEX IF NOT EXISTS "DailyEcsCheckIn_athleteId_date_idx"
  ON "DailyEcsCheckIn"("athleteId", "date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DailyEcsCheckIn_athleteId_fkey'
  ) THEN
    ALTER TABLE "DailyEcsCheckIn"
      ADD CONSTRAINT "DailyEcsCheckIn_athleteId_fkey"
      FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
