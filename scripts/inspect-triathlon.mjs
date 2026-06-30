import "dotenv/config";
import fs from "fs";
import { unzip } from "fflate";
import { Decoder, Stream } from "@garmin/fitsdk";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const zipPath =
  process.argv[2] ??
  "C:\\Users\\pjohn\\OneDrive\\Desktop\\workout types\\20386924763 triathlon.zip";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const replacer = (_k, v) => (v instanceof Date ? v.toISOString() : v);

async function main() {
  const buf = new Uint8Array(fs.readFileSync(zipPath));
  const files = await new Promise((res, rej) =>
    unzip(buf, (e, f) => (e ? rej(e) : res(f)))
  );

  console.log("=== ZIP CONTENTS ===");
  for (const [name, data] of Object.entries(files)) {
    console.log(`  ${name} (${data.length} bytes)`);
  }

  const fitPaths = Object.keys(files).filter((p) => /\.fit$/i.test(p));
  console.log("\nFIT files in zip:", fitPaths.length);

  for (const fitPath of fitPaths) {
    console.log(`\n${"=".repeat(60)}\n=== ${fitPath} ===`);
    const fit = files[fitPath];
    const { messages, errors } = new Decoder(Stream.fromByteArray(Array.from(fit))).read();
    console.log("decode errors:", errors?.length ?? 0);

    const counts = Object.fromEntries(
      Object.entries(messages)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, v.length])
    );
    console.log("\nMessage counts:", JSON.stringify(counts, null, 2));

    console.log("\n--- fileId ---");
    console.log(JSON.stringify(messages.fileIdMesgs?.[0], replacer, 2));

    console.log("\n--- activity ---");
    console.log(JSON.stringify(messages.activityMesgs?.[0], replacer, 2));

    console.log("\n--- sessions ---");
    for (const [i, s] of (messages.sessionMesgs ?? []).entries()) {
      console.log(
        JSON.stringify(
          {
            index: i,
            sport: s.sport,
            subSport: s.subSport,
            start: s.startTime ?? s.timestamp,
            elapsed: s.totalElapsedTime,
            timer: s.totalTimerTime,
            distance: s.totalDistance,
            avgSpeed: s.avgSpeed ?? s.enhancedAvgSpeed,
            avgPower: s.avgPower,
            avgHr: s.avgHeartRate,
            numLaps: s.numLaps,
            firstLapIndex: s.firstLapIndex,
            messageIndex: s.messageIndex,
          },
          replacer,
          2
        )
      );
    }

    const records = messages.recordMesgs ?? [];
    console.log("\n--- records ---");
    console.log("total:", records.length);
    if (records.length > 0) {
      const fields = new Set();
      for (const r of records) for (const k of Object.keys(r)) fields.add(k);
      console.log("fields:", [...fields].sort().join(", "));
      const t0 = records[0].timestamp;
      const t1 = records[records.length - 1].timestamp;
      console.log("time span:", t0?.toISOString?.(), "→", t1?.toISOString?.());
      const power = records.filter((r) => (r.power ?? 0) > 0).length;
      const hr = records.filter((r) => (r.heartRate ?? 0) > 0).length;
      const speed = records.filter(
        (r) => ((r.speed ?? r.enhancedSpeed) ?? 0) > 0
      ).length;
      console.log("samples with power/hr/speed:", power, hr, speed);
    }

    console.log("\n--- laps (all) ---");
    for (const [i, l] of (messages.lapMesgs ?? []).entries()) {
      console.log(
        JSON.stringify(
          {
            index: i,
            sport: l.sport,
            subSport: l.subSport,
            start: l.startTime,
            elapsed: l.totalElapsedTime,
            distance: l.totalDistance,
            avgSpeed: l.avgSpeed ?? l.enhancedAvgSpeed,
            avgPower: l.avgPower,
          },
          replacer,
          2
        )
      );
    }

    console.log("\n--- events ---");
    for (const e of messages.eventMesgs ?? []) {
      console.log(
        JSON.stringify(
          {
            timestamp: e.timestamp,
            event: e.event,
            eventType: e.eventType,
            data: e.data,
            timerTrigger: e.timerTrigger,
          },
          replacer,
          2
        )
      );
    }
  }

  console.log(`\n${"=".repeat(60)}\n=== DATABASE (Sep 2025 multisport) ===`);
  const acts = await db.syncedActivity.findMany({
    where: {
      startTime: { gte: new Date("2025-09-01"), lt: new Date("2025-10-01") },
      multisportGroupId: { not: null },
    },
    orderBy: [{ multisportGroupId: "asc" }, { sessionIndex: "asc" }],
    select: {
      id: true,
      name: true,
      startTime: true,
      discipline: true,
      durationSeconds: true,
      distanceMeters: true,
      multisportGroupId: true,
      sessionIndex: true,
      legType: true,
      externalId: true,
      noUsableSignal: true,
      rawStreams: true,
    },
  });

  for (const a of acts) {
    const streams = a.rawStreams ?? {};
    const keys = Object.keys(streams);
    const watts = streams.watts?.data?.length ?? 0;
    const hr = streams.heartrate?.data?.length ?? 0;
    const vel = streams.velocity?.data?.length ?? 0;
  console.log({
      id: a.id,
      name: a.name,
      start: a.startTime.toISOString(),
      leg: a.legType,
      sessionIndex: a.sessionIndex,
      durationSec: a.durationSeconds,
      distanceM: a.distanceMeters,
      group: a.multisportGroupId,
      streams: keys,
      recordSamples: { watts, hr, vel },
      noUsableSignal: a.noUsableSignal,
    });
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
