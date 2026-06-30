-- Add STRENGTH to Discipline enum (idempotent). Run after manual_season_plan.sql.

DO $$ BEGIN
  ALTER TYPE "Discipline" ADD VALUE 'STRENGTH';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
