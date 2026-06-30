-- Verify Phase 2 weekly plan migration state
SELECT 'tables' AS check_type, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('PlannedBlock', 'WeeklyPlan', 'WeeklyPlanWeek', 'PlannedSession', 'StructuredWorkout')
ORDER BY table_name;

SELECT 'PlannedSession columns' AS check_type, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'PlannedSession'
  AND column_name IN (
    'plannedBlockId', 'weeklyPlanId', 'source', 'zoneAllocationMissing',
    'distanceMeters', 'targetSpeedMps', 'targetPaceSeconds'
  )
ORDER BY column_name;

SELECT 'StructuredWorkout columns' AS check_type, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'StructuredWorkout'
  AND column_name IN ('plannedBlockId', 'weeklyPlanId')
ORDER BY column_name;

SELECT 'WeeklyPlan columns' AS check_type, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'WeeklyPlan'
ORDER BY ordinal_position;

SELECT 'constraints' AS check_type, conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE conname IN (
  'WeeklyPlan_athleteId_fkey',
  'WeeklyPlan_weeklyPlanWeekId_fkey',
  'WeeklyPlanWeek_athleteId_fkey',
  'PlannedSession_weeklyPlanId_fkey',
  'StructuredWorkout_weeklyPlanId_fkey',
  'PlannedSession_plannedBlockId_fkey',
  'StructuredWorkout_plannedBlockId_fkey'
)
ORDER BY conname;

SELECT 'row counts' AS check_type,
  (SELECT count(*) FROM "WeeklyPlan") AS weekly_plan_rows,
  (SELECT count(*) FROM "WeeklyPlanWeek") AS weekly_plan_week_rows,
  (SELECT count(*) FROM "PlannedSession") AS planned_session_rows;
