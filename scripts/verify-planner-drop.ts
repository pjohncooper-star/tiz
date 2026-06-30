import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

const plannerTables = [
  "Macrocycle",
  "GoalEvent",
  "Mesocycle",
  "Microcycle",
  "WeeklyProposal",
  "WeeklyPlan",
  "WeeklyPlanWeek",
];

const plannerEnums = [
  "WeeklyPlanMode",
  "WeeklyPlanSource",
  "WeeklyProposalStatus",
  "MesocycleObjective",
  "GoalEventDiscipline",
  "EventPriority",
];

async function main() {
  const inList = (items: string[]) => items.map((x) => `'${x}'`).join(", ");

  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name::text AS table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN (${inList(plannerTables)})
    ORDER BY table_name`);

  const anchor = await db.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name::text AS table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'AnchorWorkout'`);

  const psCols = await db.$queryRawUnsafe<{ column_name: string }[]>(`
    SELECT column_name::text AS column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PlannedSession'
    AND column_name IN ('weeklyPlanId', 'anchorWorkoutId')`);

  const awCols = await db.$queryRawUnsafe<{ column_name: string }[]>(`
    SELECT column_name::text AS column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AnchorWorkout'
    AND column_name IN ('macrocycleId', 'athleteId', 'weekday')`);

  const swCols = await db.$queryRawUnsafe<{ column_name: string }[]>(`
    SELECT column_name::text AS column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'StructuredWorkout'
    AND column_name IN ('weeklyPlanId', 'plannedBlockId')`);

  const enums = await db.$queryRawUnsafe<{ typname: string }[]>(`
    SELECT typname::text AS typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND typname IN (${inList(plannerEnums)})
    ORDER BY typname`);

  const issues: string[] = [];
  if (tables.length) {
    issues.push(`Planner tables still exist: ${tables.map((t) => t.table_name).join(", ")}`);
  }
  if (!anchor.length) issues.push("AnchorWorkout table missing");
  if (psCols.some((c) => c.column_name === "weeklyPlanId")) {
    issues.push("PlannedSession.weeklyPlanId still exists");
  }
  if (!psCols.some((c) => c.column_name === "anchorWorkoutId")) {
    issues.push("PlannedSession.anchorWorkoutId missing");
  }
  if (awCols.some((c) => c.column_name === "macrocycleId")) {
    issues.push("AnchorWorkout.macrocycleId still exists");
  }
  for (const col of ["athleteId", "weekday"]) {
    if (!awCols.some((c) => c.column_name === col)) {
      issues.push(`AnchorWorkout.${col} missing`);
    }
  }
  if (swCols.length) {
    issues.push(
      `StructuredWorkout planner columns still exist: ${swCols.map((c) => c.column_name).join(", ")}`
    );
  }
  if (enums.length) {
    issues.push(`Planner enums still exist: ${enums.map((e) => e.typname).join(", ")}`);
  }

  console.log("=== Planner drop verification ===");
  console.log(
    "Planner tables remaining:",
    tables.length ? tables.map((t) => t.table_name).join(", ") : "(none)"
  );
  console.log("AnchorWorkout table:", anchor.length ? "present" : "MISSING");
  console.log(
    "PlannedSession columns:",
    psCols.map((c) => c.column_name).join(", ") || "(none of checked)"
  );
  console.log(
    "AnchorWorkout columns:",
    awCols.map((c) => c.column_name).join(", ") || "(none of checked)"
  );
  console.log(
    "StructuredWorkout planner cols:",
    swCols.length ? swCols.map((c) => c.column_name).join(", ") : "(none)"
  );
  console.log(
    "Planner enums remaining:",
    enums.length ? enums.map((e) => e.typname).join(", ") : "(none)"
  );
  console.log("");

  if (issues.length) {
    console.log("FAIL");
    for (const issue of issues) console.log(" -", issue);
    process.exit(1);
  }

  console.log("PASS: all planner drops complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
