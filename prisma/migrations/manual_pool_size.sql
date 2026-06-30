-- Add PoolSize for swim workout-card units (idempotent)
-- Run in Neon SQL editor, then: npx prisma generate

DO $$ BEGIN
  CREATE TYPE "PoolSize" AS ENUM ('SCY', 'SCM', 'LCM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AthleteDisciplineSettings"
  ADD COLUMN IF NOT EXISTS "poolSize" "PoolSize";

UPDATE "AthleteDisciplineSettings"
SET "poolSize" = 'SCM'
WHERE discipline = 'SWIM' AND "poolSize" IS NULL;
