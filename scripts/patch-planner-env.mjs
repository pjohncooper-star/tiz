#!/usr/bin/env node
/**
 * Ensures .env has the feature flags needed to test the simple season planner.
 * Preserves all other variables. Safe to run repeatedly.
 *
 * Usage: node scripts/patch-planner-env.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const envPath = join(root, ".env");

if (!existsSync(envPath)) {
  console.error("No .env file found. Copy .env.example first:\n  cp .env.example .env");
  process.exit(1);
}

const REQUIRED = {
  FEATURE_PLAN_BUILDER: "true",
  FEATURE_SIMPLE_SEASON_PLANNER: "true",
};

const OPTIONAL_DEFAULTS = {
  FEATURE_PLANNING_CALENDAR: "true",
};

const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
const seen = new Set();

const updated = lines.map((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return line;

  const eq = line.indexOf("=");
  if (eq === -1) return line;

  const key = line.slice(0, eq).trim();
  if (key in REQUIRED) {
    seen.add(key);
    return `${key}=${REQUIRED[key]}`;
  }
  if (key in OPTIONAL_DEFAULTS && !seen.has(key)) {
    seen.add(key);
    const current = line.slice(eq + 1).trim();
    if (!current) return `${key}=${OPTIONAL_DEFAULTS[key]}`;
  }
  if (key in OPTIONAL_DEFAULTS) seen.add(key);
  return line;
});

const toAppend = [];

for (const [key, value] of Object.entries(REQUIRED)) {
  if (!seen.has(key)) toAppend.push(`${key}=${value}`);
}
for (const [key, value] of Object.entries(OPTIONAL_DEFAULTS)) {
  if (!lines.some((l) => l.trimStart().startsWith(`${key}=`))) {
    toAppend.push(`${key}=${value}`);
  }
}

let out = updated.join("\n");
if (toAppend.length > 0) {
  if (!out.endsWith("\n")) out += "\n";
  out += "\n# Simple season planner (added by scripts/patch-planner-env.mjs)\n";
  out += toAppend.join("\n") + "\n";
}

writeFileSync(envPath, out, "utf8");

console.log("Updated .env for simple season planner testing:\n");
for (const [key, value] of Object.entries(REQUIRED)) {
  console.log(`  ${key}=${value}`);
}
console.log("\nRestart the dev server: npm run dev");
