-- Drop season/macrocycle planner tables (idempotent). Run after backing up if needed.
-- Apply: npx prisma db execute --file prisma/migrations/manual_drop_planner.sql --schema prisma/schema.prisma
-- Then:  npx prisma generate

-- ---------------------------------------------------------------------------
-- 1. Detach PlannedSession from WeeklyPlan
-- ---------------------------------------------------------------------------
UPDATE "PlannedSession" SET "weeklyPlanId" = NULL WHERE "weeklyPlanId" IS NOT NULL;

ALTER TABLE "PlannedSession" DROP CONSTRAINT IF EXISTS "PlannedSession_weeklyPlanId_fkey";
ALTER TABLE "PlannedSession" DROP COLUMN IF EXISTS "weeklyPlanId";

-- ---------------------------------------------------------------------------
-- 2. Detach StructuredWorkout from WeeklyPlan
-- ---------------------------------------------------------------------------
UPDATE "StructuredWorkout" SET "weeklyPlanId" = NULL WHERE "weeklyPlanId" IS NOT NULL;

ALTER TABLE "StructuredWorkout" DROP CONSTRAINT IF EXISTS "StructuredWorkout_weeklyPlanId_fkey";
ALTER TABLE "StructuredWorkout" DROP CONSTRAINT IF EXISTS "StructuredWorkout_plannedBlockId_fkey";
ALTER TABLE "StructuredWorkout" DROP COLUMN IF EXISTS "weeklyPlanId";
ALTER TABLE "StructuredWorkout" DROP COLUMN IF EXISTS "plannedBlockId";

-- ---------------------------------------------------------------------------
-- 3. Detach AnchorWorkout from Macrocycle
-- ---------------------------------------------------------------------------
UPDATE "AnchorWorkout" SET "macrocycleId" = NULL WHERE "macrocycleId" IS NOT NULL;

ALTER TABLE "AnchorWorkout" DROP CONSTRAINT IF EXISTS "AnchorWorkout_macrocycleId_fkey";
ALTER TABLE "AnchorWorkout" DROP COLUMN IF EXISTS "macrocycleId";
DROP INDEX IF EXISTS "AnchorWorkout_macrocycleId_idx";

-- ---------------------------------------------------------------------------
-- 4. Break Macrocycle <-> GoalEvent circular FK before drops
-- ---------------------------------------------------------------------------
ALTER TABLE "Macrocycle" DROP CONSTRAINT IF EXISTS "Macrocycle_primaryGoalEventId_fkey";
ALTER TABLE "Macrocycle" DROP COLUMN IF EXISTS "primaryGoalEventId";

-- ---------------------------------------------------------------------------
-- 5. Drop planner tables (child tables first)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "WeeklyProposal";
DROP TABLE IF EXISTS "Microcycle";
DROP TABLE IF EXISTS "Mesocycle";
DROP TABLE IF EXISTS "WeeklyPlan";
DROP TABLE IF EXISTS "WeeklyPlanWeek";
DROP TABLE IF EXISTS "GoalEvent";
DROP TABLE IF EXISTS "Macrocycle";

-- ---------------------------------------------------------------------------
-- 6. Drop planner-only enums (keep Weekday, PlannedSessionSource, Discipline)
-- ---------------------------------------------------------------------------
DROP TYPE IF EXISTS "WeeklyProposalStatus";
DROP TYPE IF EXISTS "MesocycleObjective";
DROP TYPE IF EXISTS "GoalEventDiscipline";
DROP TYPE IF EXISTS "EventPriority";
DROP TYPE IF EXISTS "WeeklyPlanSource";
DROP TYPE IF EXISTS "WeeklyPlanMode";
