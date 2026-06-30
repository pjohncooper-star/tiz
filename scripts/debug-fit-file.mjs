import fs from "fs";
import { gunzipSync } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/debug-fit-file.mjs <file.fit|.fit.gz>");
  process.exit(1);
}

let bytes = fs.readFileSync(path);
if (path.toLowerCase().endsWith(".gz")) {
  bytes = gunzipSync(bytes);
}

const stream = Stream.fromByteArray(Array.from(bytes));
const decoder = new Decoder(stream);
if (!decoder.isFIT()) {
  console.error("Not a FIT file");
  process.exit(1);
}

const { messages, errors } = decoder.read();
const records = messages.recordMesgs ?? [];
const session = messages.sessionMesgs?.[0];
const workout = messages.workoutMesgs?.[0];

const fieldDescriptions = messages.fieldDescriptionMesgs ?? [];
const powerFieldKeys = fieldDescriptions
  .filter((f) => /power|watt/i.test(String(f.fieldName ?? "")))
  .map((f) => ({ key: f.key, name: f.fieldName, devIndex: f.developerDataIndex }));

const powerVals = records.map((r) => r.power).filter((v) => typeof v === "number" && v > 0);
const speedVals = records
  .map((r) => r.speed ?? r.enhancedSpeed)
  .filter((v) => typeof v === "number" && v > 0);
const distVals = records.map((r) => r.distance).filter((v) => typeof v === "number");

let monotonicSpeed = true;
for (let i = 1; i < speedVals.length; i++) {
  if (speedVals[i] < speedVals[i - 1]) {
    monotonicSpeed = false;
    break;
  }
}

const devSamples = records.slice(0, 3).map((r) => r.developerFields ?? {});

console.log(
  JSON.stringify(
    {
      path,
      errors: errors?.length ?? 0,
      fileType: messages.fileIdMesgs?.[0]?.type,
      activityName: messages.activityMesgs?.[0]?.name,
      workoutName: workout?.wktName ?? workout?.workoutName,
      session: session
        ? {
            start: (session.startTime ?? session.timestamp)?.toISOString?.() ??
              session.startTime,
            duration: session.totalElapsedTime ?? session.totalTimerTime,
            distance: session.totalDistance,
            avgPower: session.avgPower,
            normalizedPower: session.normalizedPower,
            sport: session.sport,
            subSport: session.subSport,
          }
        : null,
      recordCount: records.length,
      recordKeys: records[0] ? Object.keys(records[0]).sort() : [],
      powerFieldKeys,
      powerCount: powerVals.length,
      powerSample: powerVals.slice(0, 5),
      speedCount: speedVals.length,
      speedSample: speedVals.slice(0, 5),
      speedMax: speedVals.length ? Math.max(...speedVals) : 0,
      monotonicSpeed,
      distSample: distVals.slice(0, 5),
      distMax: distVals.length ? Math.max(...distVals) : null,
      devSamples,
    },
    null,
    2
  )
);
