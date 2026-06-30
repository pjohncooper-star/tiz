import fs from "fs";
import { gunzipSync, unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const zipPath = process.argv[2] ?? "C:/Users/pjohn/Downloads/export_7924471.zip";
const dayPrefix = process.argv[3] ?? "2026-06-04";
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
  if (!decoder.isFIT()) return [];
  const { messages } = decoder.read();
  const sessions = messages.sessionMesgs ?? [];
  const records = messages.recordMesgs ?? [];
  const out = [];
  for (const session of sessions) {
    const start = session.startTime ?? session.timestamp;
    if (!(start instanceof Date)) continue;
    const powerVals = records.map((r) => r.power).filter((v) => typeof v === "number" && v > 0);
    out.push({
      path: filePath,
      name: messages.activityMesgs?.[0]?.name,
      start: start.toISOString(),
      duration: Math.round(session.totalElapsedTime ?? session.totalTimerTime ?? 0),
      distance: session.totalDistance,
      avgPower: session.avgPower,
      sport: session.sport,
      powerCount: powerVals.length,
      powerMax: powerVals.length ? Math.max(...powerVals) : 0,
      recordKeys: records[0] ? Object.keys(records[0]).sort() : [],
    });
  }
  return out;
}

console.log("Loading", zipPath);
const entries = (await extractZipNested(new Uint8Array(fs.readFileSync(zipPath)))).map(gunzipEntry);
const fits = entries.filter((e) => e.path.toLowerCase().endsWith(".fit"));
console.log("FIT files", fits.length);
const matches = [];
for (const entry of fits) {
  for (const info of analyze(entry.data, entry.path)) {
    if (info.start.startsWith(dayPrefix)) matches.push(info);
  }
}
matches.sort((a, b) => a.start.localeCompare(b.start));
console.log("matches", matches.length);
for (const m of matches) console.log(JSON.stringify(m));
