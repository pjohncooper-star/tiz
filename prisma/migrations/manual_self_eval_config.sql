-- Self-evaluation config on Athlete, custom survey fields, MANUAL survey source

ALTER TYPE "SurveySource" ADD VALUE IF NOT EXISTS 'MANUAL';

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "selfEvalConfig" JSONB;

ALTER TABLE "SurveyResponse" ADD COLUMN IF NOT EXISTS "customFields" JSONB;
