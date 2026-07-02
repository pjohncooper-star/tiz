-- Per-discipline goal times on season goal events (multisport races).

ALTER TABLE "GoalEvent" ADD COLUMN IF NOT EXISTS "swimGoalMinutes" INTEGER;
ALTER TABLE "GoalEvent" ADD COLUMN IF NOT EXISTS "bikeGoalMinutes" INTEGER;
ALTER TABLE "GoalEvent" ADD COLUMN IF NOT EXISTS "runGoalMinutes" INTEGER;
