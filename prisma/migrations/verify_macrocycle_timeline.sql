-- Verify macrocycle timeline columns
SELECT 'Microcycle.params' AS check_type,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Microcycle' AND column_name = 'params'
  ) AS ok;

SELECT 'WeeklyPlanWeek.disciplineDistanceMeters' AS check_type,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WeeklyPlanWeek' AND column_name = 'disciplineDistanceMeters'
  ) AS ok;
