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
  type ParsedPlannedSessionImport,
} from "@/lib/plan/csv-import";

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
): Promise<{ created: number; sessions: ParsedPlannedSessionImport[] }> {
  const byteLength = new TextEncoder().encode(csvText).byteLength;
  if (byteLength > MAX_PLANNED_SESSION_CSV_BYTES) {
    throw new PlannedSessionsCsvImportError(
      `CSV is too large (max ${MAX_PLANNED_SESSION_CSV_BYTES} bytes)`,
      400
    );
  }

  const settings = await loadDisciplineSettings(athleteId);
  const parsed = parsePlannedSessionsCsv(csvText, settings);
  if (!parsed.ok) {
    throw new PlannedSessionsCsvImportError("CSV validation failed", 400, parsed.errors);
  }

  await db.plannedSession.createMany({
    data: parsed.sessions.map((session) => toCreateData(athleteId, session)),
  });

  return { created: parsed.sessions.length, sessions: parsed.sessions };
}
