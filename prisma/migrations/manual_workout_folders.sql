-- Workout folder tree + progressions (replaces WorkoutComponent library)

CREATE TYPE "WorkoutFolderKind" AS ENUM ('LIBRARY', 'PROGRESSION');

-- Extend WorkoutFolder
ALTER TABLE "WorkoutFolder" ADD COLUMN IF NOT EXISTS "parentFolderId" TEXT;
ALTER TABLE "WorkoutFolder" ADD COLUMN IF NOT EXISTS "folderKind" "WorkoutFolderKind" NOT NULL DEFAULT 'LIBRARY';
ALTER TABLE "WorkoutFolder" ADD COLUMN IF NOT EXISTS "discipline" "Discipline";
ALTER TABLE "WorkoutFolder" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkoutFolder" ADD COLUMN IF NOT EXISTS "lastCompletedAt" TIMESTAMP(3);
ALTER TABLE "WorkoutFolder" ADD COLUMN IF NOT EXISTS "lastCompletedTemplateId" TEXT;
ALTER TABLE "WorkoutFolder" ADD COLUMN IF NOT EXISTS "lastCompletedSessionId" TEXT;
ALTER TABLE "WorkoutFolder" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "WorkoutFolder" DROP CONSTRAINT IF EXISTS "WorkoutFolder_athleteId_name_key";

ALTER TABLE "WorkoutFolder"
  ADD CONSTRAINT "WorkoutFolder_parentFolderId_fkey"
  FOREIGN KEY ("parentFolderId") REFERENCES "WorkoutFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutFolder"
  ADD CONSTRAINT "WorkoutFolder_lastCompletedTemplateId_fkey"
  FOREIGN KEY ("lastCompletedTemplateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkoutFolder"
  ADD CONSTRAINT "WorkoutFolder_lastCompletedSessionId_fkey"
  FOREIGN KEY ("lastCompletedSessionId") REFERENCES "PlannedSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "WorkoutFolder_athleteId_parentFolderId_sortOrder_idx"
  ON "WorkoutFolder"("athleteId", "parentFolderId", "sortOrder");

-- Extend WorkoutTemplate
ALTER TABLE "WorkoutTemplate" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutTemplate_folderId_sortOrder_key"
  ON "WorkoutTemplate"("folderId", "sortOrder")
  WHERE "folderId" IS NOT NULL AND "sortOrder" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "WorkoutTemplate_folderId_idx" ON "WorkoutTemplate"("folderId");

-- Session provenance
CREATE TABLE IF NOT EXISTS "SessionWorkoutSource" (
  "id" TEXT NOT NULL,
  "plannedSessionId" TEXT NOT NULL,
  "folderId" TEXT,
  "workoutTemplateId" TEXT NOT NULL,
  "sortOrder" INTEGER,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionWorkoutSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SessionWorkoutSource_plannedSessionId_key"
  ON "SessionWorkoutSource"("plannedSessionId");

CREATE INDEX IF NOT EXISTS "SessionWorkoutSource_workoutTemplateId_idx"
  ON "SessionWorkoutSource"("workoutTemplateId");

ALTER TABLE "SessionWorkoutSource"
  ADD CONSTRAINT "SessionWorkoutSource_plannedSessionId_fkey"
  FOREIGN KEY ("plannedSessionId") REFERENCES "PlannedSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionWorkoutSource"
  ADD CONSTRAINT "SessionWorkoutSource_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "WorkoutFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SessionWorkoutSource"
  ADD CONSTRAINT "SessionWorkoutSource_workoutTemplateId_fkey"
  FOREIGN KEY ("workoutTemplateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate WorkoutComponent data into progression folders (best effort)
DO $$
DECLARE
  comp RECORD;
  folder_id TEXT;
  idx INT;
  prog RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'WorkoutComponent') THEN
    FOR comp IN SELECT * FROM "WorkoutComponent" LOOP
      folder_id := gen_random_uuid()::text;
      INSERT INTO "WorkoutFolder" (
        "id", "athleteId", "name", "folderKind", "discipline",
        "sortOrder", "lastCompletedAt", "lastCompletedSessionId",
        "createdAt", "updatedAt"
      ) VALUES (
        folder_id, comp."athleteId", comp."name", 'PROGRESSION', comp."discipline",
        0, comp."lastCompletedAt", comp."lastCompletedSessionId",
        comp."createdAt", comp."updatedAt"
      );
      INSERT INTO "WorkoutTemplate" (
        "id", "athleteId", "folderId", "discipline", "name", "steps", "sortOrder",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text, comp."athleteId", folder_id, comp."discipline",
        'Base', comp."steps", 0, comp."createdAt", comp."updatedAt"
      );
      idx := 1;
      FOR prog IN
        SELECT * FROM "ComponentProgressionStep"
        WHERE "componentId" = comp."id"
        ORDER BY "orderIndex" ASC
      LOOP
        INSERT INTO "WorkoutTemplate" (
          "id", "athleteId", "folderId", "discipline", "name", "steps", "sortOrder",
          "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text, comp."athleteId", folder_id, comp."discipline",
          prog."label", prog."steps", idx, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );
        idx := idx + 1;
      END LOOP;
    END LOOP;
  END IF;
END $$;

-- Drop legacy component tables
DROP TABLE IF EXISTS "SessionComponentInstance";
DROP TABLE IF EXISTS "ComponentProgressionStep";
DROP TABLE IF EXISTS "WorkoutComponent";
DROP TYPE IF EXISTS "ComponentType";
