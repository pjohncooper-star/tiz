-- Optional per-session TiZ metric override on PlannedSession.
-- Null = inherit role override → discipline primary.
-- Run manually after deploying schema changes.

ALTER TABLE "PlannedSession"
  ADD COLUMN IF NOT EXISTS "tizSignalOverride" "SignalType";
