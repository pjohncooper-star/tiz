-- Per-session and template swim pool size.
-- Run after manual_pool_size.sql and manual_planning_calendar.sql.

ALTER TABLE "PlannedSession"
  ADD COLUMN IF NOT EXISTS "poolSize" "PoolSize";

ALTER TABLE "WeeklyScheduleTemplateItem"
  ADD COLUMN IF NOT EXISTS "poolSize" "PoolSize";
