import fs from "fs";
import path from "path";
import { gunzipSync, unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const zipPath = process.argv[2];
if (!zipPath) {
  console.error("Usage: node scripts/inspect-zip.mjs <path-to.zip>");
  process.exit(1);
}

async function extractZip(buffer) {
  return new Promise((resolve, reject) => {
    unzip(buffer, (err, files) => {
      if (err) return reject(err);
      resolve(Object.entries(files).map(([p, data]) => ({ path: p, data })));
    });
  });
}

function inspectFit(bytes, filePath) {
  const stream = Stream.fromByteArray(Array.from(bytes));
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) return { path: filePath, error: "not fit" };
  const { messages } = decoder.read();
  const sessions = (messages.sessionMesgs ?? []).map((s, i) => ({
    i,
    sport: s.sport,
    subSport: s.subSport,
    start: (s.startTime ?? s.timestamp)?.toISOString?.() ?? s.startTime,
    duration: Math.round(s.totalElapsedTime ?? s.totalTimerTime ?? 0),
    distance: s.totalDistance,
    avgPower: s.avgPower,
  }));
  const records = messages.recordMesgs ?? [];
  const powerCount = records.filter((r) => (r.power ?? 0) > 0).length;
  const hrCount = records.filter((r) => (r.heartRate ?? 0) > 0).length;
  return {
    path: filePath,
    fileType: messages.fileIdMesgs?.[0]?.type,
    activityName: messages.activityMesgs?.[0]?.name,
    workoutName: messages.workoutMesgs?.[0]?.wktName ?? messages.workoutMesgs?.[0]?.workoutName,
    sessionCount: sessions.length,
    sessions,
    recordCount: records.length,
    powerCount,
    hrCount,
    recordKeys: records[0] ? Object.keys(records[0]).sort() : [],
  };
}

const buf = new Uint8Array(fs.readFileSync(zipPath));
const entries = await extractZip(buf);
console.log("ZIP:", path.basename(zipPath), "entries:", entries.length);
for (const { path: p, data } of entries) {
  console.log(" -", p, data.length, "bytes");
  let fit = data;
  if (p.toLowerCase().endsWith(".gz")) fit = gunzipSync(data);
  if (p.toLowerCase().includes(".fit")) {
    console.log(JSON.stringify(inspectFit(fit, p), null, 2));
  }
}
