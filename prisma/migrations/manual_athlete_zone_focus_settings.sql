-- Athlete-level zone focus settings for simple season planner.
-- zoneFocusCatalog: editable focus names + Z1–Z5 % presets
-- phaseKindZoneDefaults: default focus per phase kind for new seasons

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "zoneFocusCatalog" JSONB;
ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "phaseKindZoneDefaults" JSONB;
