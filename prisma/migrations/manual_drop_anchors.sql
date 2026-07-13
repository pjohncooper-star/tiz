-- Drop anchor workouts: convert legacy sessions, remove column, drop table, shrink enum.

UPDATE "PlannedSession"
SET source = 'FLEXIBLE', "anchorWorkoutId" = NULL
WHERE source = 'ANCHORED_INSTANCE' OR "anchorWorkoutId" IS NOT NULL;

ALTER TABLE "PlannedSession" DROP CONSTRAINT IF EXISTS "PlannedSession_anchorWorkoutId_fkey";
DROP INDEX IF EXISTS "PlannedSession_athleteId_anchorWorkoutId_scheduledDate_key";
ALTER TABLE "PlannedSession" DROP COLUMN IF EXISTS "anchorWorkoutId";

DROP TABLE IF EXISTS "AnchorWorkout";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PlannedSessionSource' AND e.enumlabel = 'ANCHORED_INSTANCE'
  ) THEN
    ALTER TYPE "PlannedSessionSource" RENAME TO "PlannedSessionSource_old";
    CREATE TYPE "PlannedSessionSource" AS ENUM ('FLEXIBLE', 'TEMPLATE', 'RACE');
    ALTER TABLE "PlannedSession"
      ALTER COLUMN source DROP DEFAULT;
    ALTER TABLE "PlannedSession"
      ALTER COLUMN source TYPE "PlannedSessionSource"
      USING source::text::"PlannedSessionSource";
    ALTER TABLE "PlannedSession"
      ALTER COLUMN source SET DEFAULT 'FLEXIBLE';
    DROP TYPE "PlannedSessionSource_old";
  END IF;
END $$;
