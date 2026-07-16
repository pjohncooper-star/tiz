-- Track which season-plan pool budget slot a session fills (chip placement).

DO $$ BEGIN
  CREATE TYPE "PoolSlotKind" AS ENUM (
    'ENDURANCE',
    'INTENSITY',
    'LONG',
    'SUBSTITUTE_ENDURANCE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PlannedSession"
  ADD COLUMN IF NOT EXISTS "poolSlotKind" "PoolSlotKind";
