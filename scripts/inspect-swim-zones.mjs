import fs from "fs";
import { unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const zipPath = process.argv[2];
const buf = new Uint8Array(fs.readFileSync(zipPath));
const files = await new Promise((res, rej) =>
  unzip(buf, (e, f) => (e ? rej(e) : res(f)))
);
const fit = files[Object.keys(files).find((p) => /\.fit$/i.test(p))];
const { messages } = new Decoder(Stream.fromByteArray(Array.from(fit))).read();

const replacer = (_k, v) => (v instanceof Date ? v.toISOString() : v);

console.log("=== TIME IN ZONE (Garmin device) ===");
for (const z of messages.timeInZoneMesgs ?? []) {
  console.log(JSON.stringify(z, replacer));
}

console.log("\n=== LENGTH STATS ===");
const lengths = messages.lengthMesgs ?? [];
const active = lengths.filter((l) => l.lengthType === "active");
const idle = lengths.filter((l) => l.lengthType !== "active");
const speeds = active.map((l) => l.avgSpeed ?? l.enhancedAvgSpeed).filter((v) => v > 0);
console.log({
  totalLengths: lengths.length,
  activeLengths: active.length,
  idleLengths: idle.length,
  speedsSample: speeds.slice(0, 6),
  speedMin: speeds.length ? Math.min(...speeds) : null,
  speedMax: speeds.length ? Math.max(...speeds) : null,
  paceSecPer100mSample: speeds.slice(0, 3).map((v) => 100 / v),
});

console.log("\n=== LAP DISTANCE PATTERN ===");
const laps = messages.lapMesgs ?? [];
console.log(
  laps.map((l) => ({
    dist: l.totalDistance,
    dur: Math.round(l.totalElapsedTime ?? 0),
    speed: l.avgSpeed ?? l.enhancedAvgSpeed,
    hr: l.avgHeartRate,
  }))
);
