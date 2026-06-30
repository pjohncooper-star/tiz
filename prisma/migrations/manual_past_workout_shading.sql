-- Past workout shading preference per discipline (idempotent)
-- Run in Neon SQL editor, then: npx prisma generate

DO $$ BEGIN
  CREATE TYPE "PastWorkoutShading" AS ENUM (
    'OFF',
    'DURATION',
    'ELAPSED_DURATION',
    'MOVING_DURATION',
    'DISTANCE',
    'TIZ'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AthleteDisciplineSettings"
  ADD COLUMN IF NOT EXISTS "pastWorkoutShading" "PastWorkoutShading" NOT NULL DEFAULT 'OFF';

ALTER TABLE "Athlete"
  ADD COLUMN IF NOT EXISTS "strengthPastWorkoutShading" "PastWorkoutShading" NOT NULL DEFAULT 'OFF';
