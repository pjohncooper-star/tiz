-- TrainerRoad-driven season: flag on SeasonPlan plus athlete pointer.
-- Safe to re-run.
--
-- Run: npm run db:migrate:trainerroad-season

ALTER TABLE "SeasonPlan" ADD COLUMN IF NOT EXISTS "trainerRoadDriven" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "trainerRoadSeasonPlanId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Athlete_trainerRoadSeasonPlanId_key"
  ON "Athlete"("trainerRoadSeasonPlanId");

DO $$ BEGIN
  ALTER TABLE "Athlete"
    ADD CONSTRAINT "Athlete_trainerRoadSeasonPlanId_fkey"
    FOREIGN KEY ("trainerRoadSeasonPlanId") REFERENCES "SeasonPlan"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
