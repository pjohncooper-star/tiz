import fs from "fs";
import { gunzipSync, unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/inspect-fit-self-eval.mjs <path-to.zip|.fit>");
  process.exit(1);
}

async function loadFitBytes(filePath) {
  const buf = new Uint8Array(fs.readFileSync(filePath));
  if (filePath.toLowerCase().endsWith(".fit")) return buf;
  const entries = await new Promise((resolve, reject) => {
    unzip(buf, (err, files) => (err ? reject(err) : resolve(files)));
  });
  const fitEntry = Object.entries(entries).find(([p]) =>
    p.toLowerCase().includes(".fit")
  );
  if (!fitEntry) throw new Error("No .fit file in zip");
  let [, data] = fitEntry;
  if (fitEntry[0].toLowerCase().endsWith(".gz")) data = gunzipSync(data);
  return data;
}

const fitBytes = await loadFitBytes(inputPath);
const { messages } = new Decoder(Stream.fromByteArray(Array.from(fitBytes))).read();

const keywords = /feel|rpe|perceiv|exert|mood|eval|effort|subjective/i;
const hits = [];

for (const [type, arr] of Object.entries(messages)) {
  if (!Array.isArray(arr)) continue;
  for (let i = 0; i < arr.length; i++) {
    for (const [key, value] of Object.entries(arr[i])) {
      if (!keywords.test(key)) continue;
      hits.push({
        message: type,
        index: i,
        field: key,
        value: value instanceof Date ? value.toISOString() : value,
      });
    }
  }
}

console.log(JSON.stringify({ hits, messageTypes: Object.keys(messages).filter((k) => Array.isArray(messages[k]) && messages[k].length).sort() }, null, 2));
