import fs from "fs";
import { unzip } from "fflate";
import { parseFitFile } from "../src/lib/import/fit.ts";

const zipPath =
  process.argv[2] ??
  "C:/Users/pjohn/OneDrive/Desktop/workout types/20386924763 triathlon.zip";

if (!fs.existsSync(zipPath)) {
  console.log("ZIP not found:", zipPath);
  process.exit(1);
}

const buf = new Uint8Array(fs.readFileSync(zipPath));
const files = await new Promise((resolve, reject) =>
  unzip(buf, (err, result) => (err ? reject(err) : resolve(result)))
);

const fitPath = Object.keys(files).find((p) => /\.fit$/i.test(p));
if (!fitPath) {
  console.log("No FIT file in zip");
  process.exit(1);
}

const parsed = parseFitFile(new Uint8Array(files[fitPath]), fitPath);
console.log(
  JSON.stringify(
    parsed.map((p) => ({
      name: p.name,
      discipline: p.discipline,
      duration: p.durationSeconds,
      distance: p.distanceMeters,
      streams: Object.keys(p.streams),
    })),
    null,
    2
  )
);
