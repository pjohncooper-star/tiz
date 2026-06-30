-- Verify planner teardown. Expect planner tables absent; AnchorWorkout present.
SELECT 'planner tables' AS check_type, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'Macrocycle',
    'GoalEvent',
    'Mesocycle',
    'Microcycle',
    'WeeklyProposal',
    'WeeklyPlan',
    'WeeklyPlanWeek'
  );

SELECT 'anchor table' AS check_type, table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'AnchorWorkout';

SELECT 'PlannedSession columns' AS check_type, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'PlannedSession'
  AND column_name IN ('weeklyPlanId', 'anchorWorkoutId');

SELECT 'AnchorWorkout columns' AS check_type, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'AnchorWorkout'
  AND column_name IN ('macrocycleId', 'athleteId', 'weekday');

SELECT 'planner enums' AS check_type, typname
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND typname IN (
    'WeeklyPlanMode',
    'WeeklyPlanSource',
    'WeeklyProposalStatus',
    'MesocycleObjective',
    'GoalEventDiscipline',
    'EventPriority'
  );
