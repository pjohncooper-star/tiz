import fs from "fs";
import { createHash } from "crypto";
import { gunzipSync, unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const zipPath =
  process.argv[2] ??
  "C:/Users/pjohn/Downloads/export_7924471.zip";
const targetFingerprint =
  process.argv[3] ?? "9ba6622ca3c3e87422ee2fc25a3f7889";

const MAX_NESTED_ZIP_DEPTH = 4;

function shouldSkipPath(path) {
  return path.split("/").some((p) => p.startsWith(".") || p === "__MACOSX");
}

function gunzipEntry(entry) {
  const lower = entry.path.toLowerCase();
  if (!lower.endsWith(".gz")) return entry;
  try {
    return {
      path: entry.path.replace(/\.gz$/i, ""),
      data: gunzipSync(entry.data),
    };
  } catch {
    return entry;
  }
}

async function extractZip(buffer) {
  return new Promise((resolve, reject) => {
    unzip(buffer, (err, files) => {
      if (err) return reject(err);
      resolve(
        Object.entries(files).map(([path, data]) => ({
          path,
          data,
        }))
      );
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
        const nested = await extractZipNested(
          entry.data,
          fullPath.replace(/\.zip$/i, ""),
          depth + 1
        );
        flat.push(...nested);
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

function mapSport(sport, subSport) {
  const values = [String(sport ?? ""), String(subSport ?? "")]
    .map((v) => v.toLowerCase())
    .filter(Boolean);
  for (const s of values) {
    if (
      s.includes("cycl") ||
      s.includes("bike") ||
      s === "riding" ||
      s.includes("ebik")
    ) {
      return "BIKE";
    }
  }
  const sportNum = String(sport);
  if (sportNum === "2" || sportNum === "21") return "BIKE";
  return null;
}

function fingerprint(discipline, startTime, durationSeconds, distanceMeters) {
  const payload = [
    discipline,
    startTime.toISOString(),
    durationSeconds,
    distanceMeters?.toFixed(0) ?? "na",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function analyzeFit(bytes, filePath) {
  const stream = Stream.fromByteArray(Array.from(bytes));
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) return null;
  const { messages } = decoder.read();
  const sessions = messages.sessionMesgs ?? [];
  const records = messages.recordMesgs ?? [];
  const results = [];
  for (const session of sessions) {
    const discipline = mapSport(session.sport, session.subSport);
    if (!discipline) continue;
    const start = session.startTime ?? session.timestamp;
    if (!(start instanceof Date)) continue;
    const durationSeconds = Math.round(
      session.totalElapsedTime ?? session.totalTimerTime ?? 0
    );
    const distanceMeters = session.totalDistance;
    const fp = fingerprint(
      discipline,
      start,
      durationSeconds,
      distanceMeters
    );
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
    results.push({
      path: filePath,
      fingerprint: fp,
      activityName: messages.activityMesgs?.[0]?.name,
      start: start.toISOString(),
      durationSeconds,
      distanceMeters,
      avgPower: session.avgPower,
      normalizedPower: session.normalizedPower,
      sport: session.sport,
      subSport: session.subSport,
      recordCount: records.length,
      powerCount: powerVals.length,
      powerSample: powerVals.slice(0, 8),
      powerMax: powerVals.length ? Math.max(...powerVals) : 0,
      hrCount: hrVals.length,
      speedCount: speedVals.length,
      speedSample: speedVals.slice(0, 8),
      speedMax: speedVals.length ? Math.max(...speedVals) : 0,
      distMax: distVals.length ? Math.max(...distVals) : null,
      distSample: distVals.slice(0, 8),
      recordKeys: records[0] ? Object.keys(records[0]).sort() : [],
      devFieldKeys: [
        ...new Set(
          records.flatMap((r) => Object.keys(r.developerFields ?? {}))
        ),
      ],
    });
  }
  return results;
}

console.log("Loading", zipPath);
const buf = new Uint8Array(fs.readFileSync(zipPath));
console.log("Extracting nested zips...");
const entries = (await extractZipNested(buf)).map(gunzipEntry);
const fitEntries = entries.filter((e) => e.path.toLowerCase().endsWith(".fit"));
console.log("FIT files:", fitEntries.length);

let scanned = 0;
for (const entry of fitEntries) {
  scanned++;
  if (scanned % 500 === 0) console.log("scanned", scanned);
  const sessions = analyzeFit(entry.data, entry.path);
  if (!sessions) continue;
  for (const info of sessions) {
    if (info.fingerprint === targetFingerprint) {
      console.log("MATCH FOUND");
      console.log(JSON.stringify(info, null, 2));
      process.exit(0);
    }
  }
}

console.log("No match for fingerprint", targetFingerprint, "after", scanned, "files");
