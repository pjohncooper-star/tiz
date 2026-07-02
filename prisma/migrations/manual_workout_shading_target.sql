-- Workout shading target: card background, metric pills, or both

DO $$ BEGIN
  CREATE TYPE "WorkoutShadingTarget" AS ENUM ('CARD', 'METRICS', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "workoutShadingTarget" "WorkoutShadingTarget" NOT NULL DEFAULT 'BOTH';
