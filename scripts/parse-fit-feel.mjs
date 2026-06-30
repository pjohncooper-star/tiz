import fs from "fs";
import { Decoder, Stream } from "@garmin/fitsdk";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/parse-fit-feel.mjs <path-to-fit>");
  process.exit(1);
}

const bytes = fs.readFileSync(path);
const stream = Stream.fromByteArray(Array.from(bytes));
const decoder = new Decoder(stream);
const { messages, errors } = decoder.read();

const replacer = (_k, v) => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  return v;
};

console.log("Errors:", errors?.length ?? 0);
console.log("Message keys:", Object.keys(messages).sort().join(", "));

for (const [key, arr] of Object.entries(messages)) {
  if (!Array.isArray(arr)) continue;
  for (const msg of arr) {
    const fields = Object.keys(msg);
    const feelFields = fields.filter((f) =>
      /feel|subjective|perceived|rpe|mood|effort|recovery|soreness|stress/i.test(f)
    );
    if (feelFields.length) {
      console.log("\n===", key, "===");
      for (const f of feelFields) console.log(f + ":", msg[f]);
    }
  }
}

for (const key of [
  "sessionMesgs",
  "activityMesgs",
  "eventMesgs",
  "developerDataIdMesgs",
  "fieldDescriptionMesgs",
]) {
  if (messages[key]?.length) {
    console.log("\n### FULL", key, "###");
    console.log(JSON.stringify(messages[key], replacer, 2));
  }
}
