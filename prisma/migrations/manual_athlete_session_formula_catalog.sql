-- Athlete-defined session formulas for the simple season planner.
-- The list starts empty. Nothing is seeded.

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "sessionFormulaCatalog" JSONB;
