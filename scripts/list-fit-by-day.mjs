import fs from "fs";
import { gunzipSync, unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const zipPath = process.argv[2];
const dayPrefix = process.argv[3] ?? "2026-06-04";

async function extractZip(buffer) {
  return new Promise((resolve, reject) => {
    unzip(buffer, (err, files) => {
      if (err) return reject(err);
      resolve(Object.entries(files).map(([path, data]) => ({ path, data })));
    });
  });
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
  const powerVals = records.map((r) => r.power).filter((v) => typeof v === "number" && v > 0);
  return {
    path: filePath,
    name: messages.activityMesgs?.[0]?.name,
    start: start instanceof Date ? start.toISOString() : String(start),
    duration: Math.round(session.totalElapsedTime ?? session.totalTimerTime ?? 0),
    distance: session.totalDistance,
    avgPower: session.avgPower,
    powerCount: powerVals.length,
    powerMax: powerVals.length ? Math.max(...powerVals) : 0,
    recordKeys: records[0] ? Object.keys(records[0]).sort() : [],
  };
}

const buf = new Uint8Array(fs.readFileSync(zipPath));
const entries = await extractZip(buf);
for (const { path, data } of entries) {
  if (!/\.fit(\.gz)?$/i.test(path)) continue;
  const fit = path.toLowerCase().endsWith(".gz") ? gunzipSync(data) : data;
  const info = analyze(fit, path);
  if (!info?.start?.startsWith(dayPrefix)) continue;
  console.log(JSON.stringify(info));
}
