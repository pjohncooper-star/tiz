-- Athlete-level swim equipment catalog for workout step pickers.

ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "swimEquipmentCatalog" JSONB;
