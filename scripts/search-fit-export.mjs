import fs from "fs";
import { gunzipSync, unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const zipPath = process.argv[2] ?? "C:/Users/pjohn/Downloads/export_7924471.zip";
const needle = (process.argv[3] ?? "trainerroad").toLowerCase();
const MAX_NESTED_ZIP_DEPTH = 4;

function shouldSkipPath(path) {
  return path.split("/").some((p) => p.startsWith(".") || p === "__MACOSX");
}

function gunzipEntry(entry) {
  if (!entry.path.toLowerCase().endsWith(".gz")) return entry;
  try {
    return { path: entry.path.replace(/\.gz$/i, ""), data: gunzipSync(entry.data) };
  } catch {
    return entry;
  }
}

async function extractZip(buffer) {
  return new Promise((resolve, reject) => {
    unzip(buffer, (err, files) => {
      if (err) return reject(err);
      resolve(Object.entries(files).map(([path, data]) => ({ path, data })));
    });
  });
}

async function extractZipNested(buffer, prefix = "", depth = 0) {
  const entries = await extractZip(buffer);
  const flat = [];
  for (const entry of entries) {
    if (shouldSkipPath(entry.path)) continue;
    const fullPath = prefix
      ? `${prefix}/${entry.path.replace(/^\/+/, "")}`
      : entry.path.replace(/^\/+/, "");
    if (fullPath.toLowerCase().endsWith(".zip") && depth < MAX_NESTED_ZIP_DEPTH) {
      try {
        flat.push(...(await extractZipNested(entry.data, fullPath.replace(/\.zip$/i, ""), depth + 1)));
        continue;
      } catch {
        flat.push({ path: fullPath, data: entry.data });
        continue;
      }
    }
    flat.push({ path: fullPath, data: entry.data });
  }
  return flat;
}

function analyze(bytes, filePath) {
  const stream = Stream.fromByteArray(Array.from(bytes));
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) return null;
  const { messages } = decoder.read();
  const session = messages.sessionMesgs?.[0];
  if (!session) return null;
  const start = session.startTime ?? session.timestamp;
  const records = messages.recordMesgs ?? [];
  const names = [
    messages.activityMesgs?.[0]?.name,
    messages.workoutMesgs?.[0]?.wktName,
    filePath,
  ]
    .filter(Boolean)
    .map(String);
  const hay = names.join(" ").toLowerCase();
  if (!hay.includes(needle) && !filePath.toLowerCase().includes(needle)) return null;
  const powerVals = records.map((r) => r.power).filter((v) => typeof v === "number" && v > 0);
  return {
    path: filePath,
    names,
    start: start instanceof Date ? start.toISOString() : String(start),
    duration: Math.round(session.totalElapsedTime ?? session.totalTimerTime ?? 0),
    distance: session.totalDistance,
    avgPower: session.avgPower,
    sport: session.sport,
    subSport: session.subSport,
    powerCount: powerVals.length,
    powerMax: powerVals.length ? Math.max(...powerVals) : 0,
    recordKeys: records[0] ? Object.keys(records[0]).sort() : [],
  };
}

console.log("Searching", zipPath, "for", needle);
const entries = (await extractZipNested(new Uint8Array(fs.readFileSync(zipPath)))).map(gunzipEntry);
const fits = entries.filter((e) => e.path.toLowerCase().endsWith(".fit"));
let found = 0;
for (const entry of fits) {
  const info = analyze(entry.data, entry.path);
  if (!info) continue;
  found++;
  console.log(JSON.stringify(info));
}
console.log("found", found);
