import fs from "fs";
import path from "path";
import { gunzipSync, unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";
import { extractZipNested, gunzipEntry, normalizeImportEntries } from "../src/lib/import/zip.ts";

const zipPath =
  process.argv[2] ??
  "C:/Users/pjohn/Downloads/export_7924471.zip";
const day = process.argv[3] ?? "2026-06-04";
const minDur = Number(process.argv[4] ?? 350);
const maxDur = Number(process.argv[5] ?? 430);

function analyzeFit(bytes, filePath) {
  const stream = Stream.fromByteArray(Array.from(bytes));
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) return null;
  const { messages } = decoder.read();
  const sessions = messages.sessionMesgs ?? [];
  const records = messages.recordMesgs ?? [];
  const session = sessions[0];
  if (!session) return null;
  const start = session.startTime ?? session.timestamp;
  const activityName = messages.activityMesgs?.[0]?.name;
  const powerVals = records
    .map((r) => r.power)
    .filter((v) => typeof v === "number" && v > 0);
  const hrVals = records
    .map((r) => r.heartRate)
    .filter((v) => typeof v === "number" && v > 0);
  const speedVals = records
    .map((r) => r.speed ?? r.enhancedSpeed)
    .filter((v) => typeof v === "number" && v > 0);
  const distVals = records
    .map((r) => r.distance)
    .filter((v) => typeof v === "number");
  const devFields = new Set();
  for (const r of records) {
    for (const [k, v] of Object.entries(r.developerFields ?? {})) {
      if (typeof v === "number" && v > 0) devFields.add(`${k}:${v}`);
    }
  }
  return {
    path: filePath,
    activityName,
    start: start instanceof Date ? start.toISOString() : String(start),
    duration: Math.round(
      session.totalElapsedTime ?? session.totalTimerTime ?? 0
    ),
    distance: session.totalDistance,
    avgPower: session.avgPower,
    normalizedPower: session.normalizedPower,
    sport: session.sport,
    subSport: session.subSport,
    recordCount: records.length,
    powerCount: powerVals.length,
    powerSample: powerVals.slice(0, 5),
    powerMax: powerVals.length ? Math.max(...powerVals) : 0,
    hrCount: hrVals.length,
    speedCount: speedVals.length,
    speedSample: speedVals.slice(0, 5),
    speedMax: speedVals.length ? Math.max(...speedVals) : 0,
    distMax: distVals.length ? Math.max(...distVals) : null,
    distSample: distVals.slice(0, 5),
    devFields: [...devFields].slice(0, 8),
    recordKeys: records[0] ? Object.keys(records[0]).sort() : [],
  };
}

console.log("Loading", zipPath);
const buf = new Uint8Array(fs.readFileSync(zipPath));
const entries = normalizeImportEntries(await extractZipNested(buf));
console.log("Importable entries:", entries.length);

const matches = [];
for (const entry of entries) {
  const ready = gunzipEntry(entry);
  const lower = ready.path.toLowerCase();
  if (!lower.endsWith(".fit")) continue;
  const info = analyzeFit(ready.data, ready.path);
  if (!info) continue;
  if (
    info.start.startsWith(day) &&
    info.duration >= minDur &&
    info.duration <= maxDur
  ) {
    matches.push(info);
  }
}

console.log(`Matches on ${day} with duration ${minDur}-${maxDur}s:`, matches.length);
for (const m of matches) {
  console.log(JSON.stringify(m, null, 2));
}
