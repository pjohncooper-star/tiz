-- Postgres cannot use a newly added enum value in the same transaction.
-- Run this file first (its own execute), then manual_trainerroad_ical.sql.

ALTER TYPE "PlannedSessionSource" ADD VALUE IF NOT EXISTS 'TRAINERROAD';
