-- Optional per-session-role TiZ metric overrides on signal preference (and current settings).
-- Sparse JSON map of SessionRole → SignalType. Unset roles inherit primarySignal.
-- Run manually after deploying schema changes.

ALTER TABLE "SignalPreference"
  ADD COLUMN IF NOT EXISTS "roleSignals" JSONB;

ALTER TABLE "AthleteDisciplineSettings"
  ADD COLUMN IF NOT EXISTS "roleSignals" JSONB;
