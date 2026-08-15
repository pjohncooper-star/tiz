import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildDisciplineSettings,
  type DisciplineUnitSettings,
  type PoolSize,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import {
  MAX_PLANNED_SESSION_CSV_BYTES,
  parsePlannedSessionsCsv,
  type CsvImportRowError,
  type CsvImportThresholds,
  type ParsedPlannedSessionImport,
} from "@/lib/plan/csv-import";
import { serializeWorkoutTree } from "@/lib/workout/workout-tree";
import { loadAthleteMaxHeartRateBpm } from "@/lib/workout/relative-hr-context.server";

export class PlannedSessionsCsvImportError extends Error {
  status: number;
  errors?: CsvImportRowError[];

  constructor(message: string, status: number, errors?: CsvImportRowError[]) {
    super(message);
    this.name = "PlannedSessionsCsvImportError";
    this.status = status;
    this.errors = errors;
  }
}

async function loadDisciplineSettings(
  athleteId: string
): Promise<Record<PlanDiscipline, DisciplineUnitSettings>> {
  const rows = await db.athleteDisciplineSettings.findMany({
    where: { athleteId },
    select: { discipline: true, displayUnit: true, poolSize: true },
  });
  return buildDisciplineSettings(
    rows.map((row) => ({
      discipline: row.discipline,
      displayUnit: row.displayUnit,
      poolSize: row.poolSize as PoolSize | null,
    }))
  );
}

export async function loadCsvImportThresholds(athleteId: string): Promise<CsvImportThresholds> {
  const [power, maxHeartRateBpm] = await Promise.all([
    db.thresholdProfile.findFirst({
      where: { athleteId, discipline: "BIKE", signalType: "POWER" },
      orderBy: { effectiveDate: "desc" },
      select: { thresholdValue: true },
    }),
    loadAthleteMaxHeartRateBpm(athleteId),
  ]);
  return {
    ftpWatts: power?.thresholdValue ?? null,
    maxHeartRateBpm,
  };
}

function toCreateData(athleteId: string, session: ParsedPlannedSessionImport) {
  return {
    athleteId,
    scheduledDate: session.scheduledDate,
    discipline: session.discipline,
    title: session.title,
    notes: session.notes,
    estimatedDurationMinutes: session.estimatedDurationMinutes,
    distanceMeters: session.distanceMeters,
    targetSpeedMps: session.targetSpeedMps,
    targetPaceSeconds: session.targetPaceSeconds,
    poolSize: session.poolSize,
    sessionRole: session.sessionRole,
    zoneAllocationMissing: session.zoneAllocationMissing,
    source: "FLEXIBLE" as const,
  };
}

export async function importPlannedSessionsCsv(
  athleteId: string,
  csvText: string
): Promise<{
  created: number;
  structured: number;
  sessions: ParsedPlannedSessionImport[];
}> {
  const byteLength = new TextEncoder().encode(csvText).byteLength;
  if (byteLength > MAX_PLANNED_SESSION_CSV_BYTES) {
    throw new PlannedSessionsCsvImportError(
      `CSV is too large (max ${MAX_PLANNED_SESSION_CSV_BYTES} bytes)`,
      400
    );
  }

  const [settings, thresholds] = await Promise.all([
    loadDisciplineSettings(athleteId),
    loadCsvImportThresholds(athleteId),
  ]);
  const parsed = parsePlannedSessionsCsv(csvText, settings, thresholds);
  if (!parsed.ok) {
    throw new PlannedSessionsCsvImportError("CSV validation failed", 400, parsed.errors);
  }

  let structured = 0;
  await db.$transaction(async (tx) => {
    for (const session of parsed.sessions) {
      const created = await tx.plannedSession.create({
        data: toCreateData(athleteId, session),
      });
      if (session.workoutTree) {
        await tx.structuredWorkout.create({
          data: {
            athleteId,
            plannedSessionId: created.id,
            discipline: session.discipline,
            steps: serializeWorkoutTree(
              session.workoutTree
            ) as Prisma.InputJsonValue,
          },
        });
        structured += 1;
      }
    }
  });

  return {
    created: parsed.sessions.length,
    structured,
    sessions: parsed.sessions,
  };
}
