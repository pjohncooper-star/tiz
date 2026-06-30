-- Macrocycle timeline: microcycle params + weekly distance budgets
--
-- Apply (preferred — do not use `prisma db push` on this project):
--   npx prisma db execute --file prisma/migrations/manual_macrocycle_timeline.sql
--
-- `db push` can fail with "WeeklyPlan_athleteId_fkey already exists" because the DB
-- was built from manual SQL (PlannedBlock → WeeklyPlan rename). Use manual migrations.
ALTER TABLE "Microcycle" ADD COLUMN IF NOT EXISTS "params" JSONB;

ALTER TABLE "WeeklyPlanWeek" ADD COLUMN IF NOT EXISTS "disciplineDistanceMeters" JSONB;
