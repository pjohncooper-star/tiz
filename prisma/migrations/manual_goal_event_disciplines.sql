-- GoalEvent: single discipline -> multi-select disciplines array

ALTER TABLE "GoalEvent"
  ADD COLUMN IF NOT EXISTS "disciplines" "GoalEventDiscipline"[];

UPDATE "GoalEvent"
SET "disciplines" = ARRAY["discipline"]::"GoalEventDiscipline"[]
WHERE "disciplines" IS NULL AND "discipline" IS NOT NULL;

ALTER TABLE "GoalEvent"
  ALTER COLUMN "disciplines" SET NOT NULL;

ALTER TABLE "GoalEvent"
  DROP COLUMN IF EXISTS "discipline";
