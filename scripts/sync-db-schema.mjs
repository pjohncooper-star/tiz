#!/usr/bin/env node
/**
 * Apply idempotent manual SQL migrations in dependency order.
 * Use when an incremental Neon DB is behind prisma/schema.prisma.
 *
 *   node scripts/sync-db-schema.mjs
 *   node scripts/sync-db-schema.mjs --calendar-only
 *   node scripts/sync-db-schema.mjs --season-only
 *
 * Fresh empty DB: prefer `npm run db:push` instead.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "prisma", "migrations");

const SEASON_MIGRATIONS = [
  "manual_season_planner.sql",
  "manual_simple_season_planner.sql",
  "manual_phase_start_week.sql",
  "manual_simple_distance_planning.sql",
  "manual_recovery_settings.sql",
  "manual_goal_event_disciplines.sql",
  "manual_goal_event_discipline_times.sql",
  "manual_season_long_week_flags.sql",
  "manual_season_deload_week_flags.sql",
  "manual_phase_volume_mesocycle.sql",
  "manual_phase_volume_ramp_percent.sql",
  "manual_discipline_volume_and_meso_splits.sql",
  "manual_race_calendar_sync.sql",
];

const CALENDAR_MIGRATIONS = [
  "manual_pool_size.sql",
  "manual_weekly_plan.sql",
  "manual_planning_calendar.sql",
  "manual_session_role.sql",
  "manual_session_pool_size.sql",
  "manual_session_completion.sql",
  "manual_session_activity_link.sql",
  "manual_calendar_schema_sync.sql",
];

const args = new Set(process.argv.slice(2));
const seasonOnly = args.has("--season-only");
const calendarOnly = args.has("--calendar-only");

let files = [];
if (seasonOnly) {
  files = SEASON_MIGRATIONS;
} else if (calendarOnly) {
  files = CALENDAR_MIGRATIONS;
} else {
  files = [...SEASON_MIGRATIONS, ...CALENDAR_MIGRATIONS];
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env or your shell.");
  process.exit(1);
}

function run(file) {
  const fullPath = path.join(migrationsDir, file);
  console.log(`\n>> ${file}`);
  const result = spawnSync(
    "npx",
    ["prisma", "db", "execute", "--file", fullPath, "--schema", "prisma/schema.prisma"],
    { cwd: root, stdio: "inherit", shell: process.platform === "win32" }
  );
  if (result.status !== 0) {
    console.error(`Failed: ${file}`);
    process.exit(result.status ?? 1);
  }
}

for (const file of files) {
  run(file);
}

console.log("\n>> prisma generate");
const gen = spawnSync("npx", ["prisma", "generate"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(gen.status ?? 0);
