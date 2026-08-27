-- Drop the 1:1 Athlete → SeasonPlan TrainerRoad pointer.
-- SeasonPlan.trainerRoadDriven is the source of truth (many seasons per athlete).
-- Safe to re-run.
--
-- Run: npm run db:migrate:trainerroad-seasons

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Athlete'
      AND column_name = 'trainerRoadSeasonPlanId'
  ) THEN
    UPDATE "SeasonPlan" sp
    SET "trainerRoadDriven" = true
    FROM "Athlete" a
    WHERE a."trainerRoadSeasonPlanId" = sp.id
      AND sp."trainerRoadDriven" = false;
  END IF;
END $$;

ALTER TABLE "Athlete" DROP CONSTRAINT IF EXISTS "Athlete_trainerRoadSeasonPlanId_fkey";

DROP INDEX IF EXISTS "Athlete_trainerRoadSeasonPlanId_key";

ALTER TABLE "Athlete" DROP COLUMN IF EXISTS "trainerRoadSeasonPlanId";
