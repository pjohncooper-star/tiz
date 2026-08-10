import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildDisciplineSettings,
  type DisciplineUnitSettings,
  type PoolSize,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import {
  CSV_BASELINE_FORM_FIELDS,
  MAX_PLANNED_SESSION_CSV_BYTES,
  parsePlannedSessionsCsv,
  type CsvImportRowError,
  type CsvImportThresholds,
  type ParsedPlannedSessionImport,
} from "@/lib/plan/csv-import";
import { serializeWorkoutTree } from "@/lib/workout/workout-tree";

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

/** Baseline overrides supplied by the import form, when the plan was written for other thresholds. */
export type CsvImportBaselineOverrides = Partial<CsvImportThresholds>;

function positiveOrNull(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null;
}

export function baselineFromFormData(form: FormData): CsvImportBaselineOverrides {
  const read = (field: string): number | null => {
    const raw = form.get(field);
    if (typeof raw !== "string" || !raw.trim()) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return {
    ftpWatts: read(CSV_BASELINE_FORM_FIELDS.ftpWatts),
    maxHeartRateBpm: read(CSV_BASELINE_FORM_FIELDS.maxHeartRateBpm),
    runThresholdPaceSeconds: read(CSV_BASELINE_FORM_FIELDS.runThresholdPaceSeconds),
    swimThresholdPaceSeconds: read(CSV_BASELINE_FORM_FIELDS.swimThresholdPaceSeconds),
  };
}

/**
 * Athlete thresholds used to normalize absolute CSV targets into % of threshold.
 * Caller overrides win so a plan written for a different athlete or a later
 * start date can declare its own baseline.
 */
export async function loadCsvImportThresholds(
  athleteId: string,
  overrides: CsvImportBaselineOverrides = {}
): Promise<CsvImportThresholds> {
  const latest = (where: {
    discipline?: "BIKE" | "RUN" | "SWIM";
    signalType: "POWER" | "HEART_RATE" | "PACE";
  }) =>
    db.thresholdProfile.findFirst({
      where: { athleteId, ...where },
      orderBy: { effectiveDate: "desc" },
      select: { thresholdValue: true },
    });

  const [power, heartRate, runPace, swimPace] = await Promise.all([
    latest({ discipline: "BIKE", signalType: "POWER" }),
    latest({ signalType: "HEART_RATE" }),
    latest({ discipline: "RUN", signalType: "PACE" }),
    latest({ discipline: "SWIM", signalType: "PACE" }),
  ]);

  return {
    ftpWatts: positiveOrNull(overrides.ftpWatts) ?? power?.thresholdValue ?? null,
    maxHeartRateBpm:
      positiveOrNull(overrides.maxHeartRateBpm) ?? heartRate?.thresholdValue ?? null,
    runThresholdPaceSeconds:
      positiveOrNull(overrides.runThresholdPaceSeconds) ?? runPace?.thresholdValue ?? null,
    swimThresholdPaceSeconds:
      positiveOrNull(overrides.swimThresholdPaceSeconds) ?? swimPace?.thresholdValue ?? null,
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
  csvText: string,
  baseline: CsvImportBaselineOverrides = {}
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
    loadCsvImportThresholds(athleteId, baseline),
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
