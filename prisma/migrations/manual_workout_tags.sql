-- Free-text workout tags on planned sessions + per-athlete autocomplete catalog

ALTER TABLE "PlannedSession" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "AthleteWorkoutTag" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AthleteWorkoutTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AthleteWorkoutTag_athleteId_name_key"
  ON "AthleteWorkoutTag"("athleteId", "name");

CREATE INDEX IF NOT EXISTS "AthleteWorkoutTag_athleteId_name_idx"
  ON "AthleteWorkoutTag"("athleteId", "name");

DO $$ BEGIN
  ALTER TABLE "AthleteWorkoutTag"
    ADD CONSTRAINT "AthleteWorkoutTag_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
