import fs from "fs";
import { unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const zipPath = process.argv[2];
const buf = new Uint8Array(fs.readFileSync(zipPath));
const files = await new Promise((res, rej) =>
  unzip(buf, (e, f) => (e ? rej(e) : res(f)))
);
const fitPath = Object.keys(files).find((p) => /\.fit$/i.test(p));
const fit = files[fitPath];
const stream = Stream.fromByteArray(Array.from(fit));
const { messages, errors } = new Decoder(stream).read();

const replacer = (_k, v) => {
  if (v instanceof Date) return v.toISOString();
  return v;
};

const messageCounts = Object.fromEntries(
  Object.entries(messages)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => [k, v.length])
);

console.log("=== FILE ===");
console.log("fit:", fitPath, "bytes:", fit.length, "errors:", errors?.length ?? 0);
console.log("\n=== MESSAGE COUNTS ===");
console.log(JSON.stringify(messageCounts, null, 2));

console.log("\n=== FILE ID ===");
console.log(JSON.stringify(messages.fileIdMesgs?.[0], replacer, 2));

console.log("\n=== ACTIVITY ===");
console.log(JSON.stringify(messages.activityMesgs?.[0], replacer, 2));

console.log("\n=== SESSION ===");
for (const s of messages.sessionMesgs ?? []) {
  console.log(JSON.stringify(s, replacer, 2));
}

console.log("\n=== RECORD SAMPLE (first 3) ===");
for (const r of (messages.recordMesgs ?? []).slice(0, 3)) {
  console.log(JSON.stringify(r, replacer, 2));
}

console.log("\n=== RECORD FIELDS PRESENT ===");
const recordFieldSet = new Set();
for (const r of messages.recordMesgs ?? []) {
  for (const k of Object.keys(r)) recordFieldSet.add(k);
}
console.log([...recordFieldSet].sort().join(", "));

console.log("\n=== LAP SUMMARY (first 8) ===");
for (const l of (messages.lapMesgs ?? []).slice(0, 8)) {
  console.log(
    JSON.stringify(
      {
        sport: l.sport,
        subSport: l.subSport,
        start: l.startTime,
        duration: l.totalElapsedTime ?? l.totalTimerTime,
        distance: l.totalDistance,
        avgSpeed: l.avgSpeed ?? l.enhancedAvgSpeed,
        avgHr: l.avgHeartRate,
        lengthType: l.lengthType,
      },
      replacer,
      2
    )
  );
}
console.log("total laps:", messages.lapMesgs?.length ?? 0);

console.log("\n=== LENGTH MESSAGES (first 8) ===");
for (const len of (messages.lengthMesgs ?? []).slice(0, 8)) {
  console.log(
    JSON.stringify(
      {
        start: len.startTime,
        lengthType: len.lengthType,
        totalElapsedTime: len.totalElapsedTime,
        totalTimerTime: len.totalTimerTime,
        totalDistance: len.totalDistance,
        avgSpeed: len.avgSpeed ?? len.enhancedAvgSpeed,
        swimStroke: len.swimStroke,
        avgSwimmingCadence: len.avgSwimmingCadence,
        totalStrokes: len.totalStrokes,
      },
      replacer,
      2
    )
  );
}
console.log("total lengths:", messages.lengthMesgs?.length ?? 0);

console.log("\n=== EVENT MESSAGES (types) ===");
const eventTypes = new Map();
for (const e of messages.eventMesgs ?? []) {
  const t = String(e.event ?? e.eventType ?? "unknown");
  eventTypes.set(t, (eventTypes.get(t) ?? 0) + 1);
}
console.log(Object.fromEntries(eventTypes));

console.log("\n=== FIELD DESCRIPTIONS (developer) ===");
for (const fd of messages.fieldDescriptionMesgs ?? []) {
  console.log(JSON.stringify({ key: fd.key, name: fd.fieldName, units: fd.units }, replacer));
}

console.log("\n=== SESSION SWIM-SPECIFIC FIELDS ===");
const session = messages.sessionMesgs?.[0];
if (session) {
  const swimKeys = Object.keys(session).filter((k) =>
    /swim|stroke|pool|length|cadence|pace|speed|distance|hr|heart/i.test(k)
  );
  const swimFields = Object.fromEntries(swimKeys.map((k) => [k, session[k]]));
  console.log(JSON.stringify(swimFields, replacer, 2));
}
