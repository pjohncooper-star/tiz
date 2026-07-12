-- GoalEvent: single discipline -> multi-select disciplines array (idempotent).
-- Safe when GoalEvent already has "disciplines" (e.g. from prisma db push).

ALTER TABLE "GoalEvent"
  ADD COLUMN IF NOT EXISTS "disciplines" "GoalEventDiscipline"[];

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'GoalEvent' AND column_name = 'discipline'
  ) THEN
    UPDATE "GoalEvent"
    SET "disciplines" = ARRAY["discipline"]::"GoalEventDiscipline"[]
    WHERE "disciplines" IS NULL AND "discipline" IS NOT NULL;
    ALTER TABLE "GoalEvent" DROP COLUMN "discipline";
  END IF;
END $$;

UPDATE "GoalEvent"
SET "disciplines" = ARRAY[]::"GoalEventDiscipline"[]
WHERE "disciplines" IS NULL;

DO $$ BEGIN
  ALTER TABLE "GoalEvent" ALTER COLUMN "disciplines" SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;
