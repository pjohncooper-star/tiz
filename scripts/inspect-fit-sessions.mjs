import fs from "fs";
import { gunzipSync, unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const zipPath = process.argv[2];
const buf = new Uint8Array(fs.readFileSync(zipPath));
const files = await new Promise((res, rej) =>
  unzip(buf, (e, f) => (e ? rej(e) : res(f)))
);
const fitPath = Object.keys(files).find((p) => /\.fit$/i.test(p));
const fit = files[fitPath];
const stream = Stream.fromByteArray(Array.from(fit));
const { messages } = new Decoder(stream).read();

console.log("sessions", (messages.sessionMesgs ?? []).length);
for (const s of messages.sessionMesgs ?? []) {
  console.log({
    sport: s.sport,
    subSport: s.subSport,
    start: (s.startTime ?? s.timestamp)?.toISOString?.(),
    duration: s.totalElapsedTime ?? s.totalTimerTime,
    distance: s.totalDistance,
  });
}
console.log("laps", (messages.lapMesgs ?? []).length);
for (const l of (messages.lapMesgs ?? []).slice(0, 15)) {
  console.log({
    sport: l.sport,
    start: l.startTime?.toISOString?.(),
    duration: l.totalElapsedTime ?? l.totalTimerTime,
    distance: l.totalDistance,
  });
}
