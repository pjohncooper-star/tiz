import type { Discipline, SignalType } from "@prisma/client";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  buildDisciplineSettings,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import { ZONE_COUNT } from "@/lib/zones/model";
import { parseZoneBoundaries } from "@/lib/zones/parse-boundaries";
import { getDefaultThreshold, zoneBoundariesFor } from "@/lib/zones/defaults";
import {
  listDisciplineSettings,
  listSignalPreferences,
  parseRoleSignals,
  type RoleSignalOverrides,
} from "@/lib/zones/signal-preference";

export const THRESHOLD_DISCIPLINES = ["BIKE", "RUN", "SWIM"] as const satisfies readonly Discipline[];

export const THRESHOLD_SIGNALS: Record<
  (typeof THRESHOLD_DISCIPLINES)[number],
  SignalType[]
> = {
  BIKE: ["POWER", "HEART_RATE"],
  RUN: ["PACE", "HEART_RATE"],
  SWIM: ["PACE"],
};

export type ThresholdProfileDraft = {
  discipline: Discipline;
  signalType: SignalType;
  thresholdValue: number;
  zoneBoundaries: number[];
  zoneCount: number;
};

export type ThresholdDisciplineDraft = {
  discipline: (typeof THRESHOLD_DISCIPLINES)[number];
  primarySignal: SignalType;
  roleSignals: RoleSignalOverrides;
  /** Effective date for the next signal-preference write (YYYY-MM-DD). */
  roleEffectiveDate: string;
  displayUnit: "METRIC" | "IMPERIAL";
  poolSize: DisciplineUnitSettings["poolSize"];
  profiles: ThresholdProfileDraft[];
};

export type ThresholdsEditorData = {
  disciplines: ThresholdDisciplineDraft[];
  unitSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
};

export type ThresholdHistoryRow = {
  id: string;
  discipline: string;
  signalType: string;
  thresholdValue: number;
  effectiveDate: string;
  isEstimated: boolean;
};

export type SignalPreferenceHistoryRow = {
  id: string;
  discipline: string;
  primarySignal: string;
  roleSignals: unknown;
  effectiveDate: string;
};

export type ThresholdHistoryEditorData = {
  thresholds: ThresholdHistoryRow[];
  signalPreferences: SignalPreferenceHistoryRow[];
  unitSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateKey(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Latest threshold profile per (discipline, signalType), normalized to the canonical zone model. */
export async function loadThresholdsEditorData(
  athleteId: string
): Promise<ThresholdsEditorData> {
  const [settings, thresholds, signalPreferences] = await Promise.all([
    listDisciplineSettings(athleteId),
    db.thresholdProfile.findMany({
      where: { athleteId },
      orderBy: { effectiveDate: "desc" },
    }),
    listSignalPreferences(athleteId),
  ]);

  const unitSettings = buildDisciplineSettings(
    settings.map((s) => ({
      discipline: s.discipline,
      displayUnit: s.displayUnit,
      poolSize: s.poolSize,
    }))
  );

  const latestByKey = new Map<string, ThresholdProfileDraft>();
  for (const row of thresholds) {
    const key = `${row.discipline}:${row.signalType}`;
    if (latestByKey.has(key)) continue;
    latestByKey.set(key, {
      discipline: row.discipline,
      signalType: row.signalType,
      thresholdValue: row.thresholdValue,
      zoneCount: ZONE_COUNT,
      zoneBoundaries: parseZoneBoundaries(row.zoneBoundaries, row.discipline),
    });
  }

  const latestPrefByDiscipline = new Map<
    string,
    { primarySignal: SignalType; roleSignals: RoleSignalOverrides }
  >();
  for (const pref of signalPreferences) {
    if (latestPrefByDiscipline.has(pref.discipline)) continue;
    latestPrefByDiscipline.set(pref.discipline, {
      primarySignal: pref.primarySignal,
      roleSignals: parseRoleSignals(
        "roleSignals" in pref ? pref.roleSignals : null
      ),
    });
  }

  const settingsByDiscipline = new Map(
    settings.map((s) => [s.discipline, s] as const)
  );

  const disciplines: ThresholdDisciplineDraft[] = THRESHOLD_DISCIPLINES.map(
    (discipline) => {
      const setting = settingsByDiscipline.get(discipline);
      const pref = latestPrefByDiscipline.get(discipline);
      const units = unitSettings[discipline];
      const profiles = THRESHOLD_SIGNALS[discipline].map((signalType) => {
        const existing = latestByKey.get(`${discipline}:${signalType}`);
        if (existing) return existing;
        return {
          discipline,
          signalType,
          thresholdValue: getDefaultThreshold(discipline, signalType),
          zoneCount: ZONE_COUNT,
          zoneBoundaries: zoneBoundariesFor(discipline, signalType),
        };
      });

      return {
        discipline,
        primarySignal:
          pref?.primarySignal ??
          setting?.primarySignal ??
          (discipline === "BIKE" ? "POWER" : "PACE"),
        roleSignals:
          pref?.roleSignals ??
          parseRoleSignals(
            setting && "roleSignals" in setting ? setting.roleSignals : null
          ),
        roleEffectiveDate: todayKey(),
        displayUnit: units.displayUnit,
        poolSize: units.poolSize,
        profiles,
      };
    }
  );

  return { disciplines, unitSettings };
}

export async function loadThresholdHistoryEditorData(
  athleteId: string
): Promise<ThresholdHistoryEditorData> {
  const [settings, thresholds, signalPreferences] = await Promise.all([
    listDisciplineSettings(athleteId),
    db.thresholdProfile.findMany({
      where: { athleteId },
      orderBy: { effectiveDate: "desc" },
    }),
    listSignalPreferences(athleteId),
  ]);

  return {
    thresholds: thresholds.map((row) => ({
      id: row.id,
      discipline: row.discipline,
      signalType: row.signalType,
      thresholdValue: row.thresholdValue,
      effectiveDate: toDateKey(row.effectiveDate),
      isEstimated: row.isEstimated,
    })),
    signalPreferences: signalPreferences.map((row) => ({
      id: row.id,
      discipline: row.discipline,
      primarySignal: row.primarySignal,
      roleSignals: "roleSignals" in row ? row.roleSignals : null,
      effectiveDate: toDateKey(row.effectiveDate),
    })),
    unitSettings: buildDisciplineSettings(
      settings.map((s) => ({
        discipline: s.discipline,
        displayUnit: s.displayUnit,
        poolSize: s.poolSize,
      }))
    ),
  };
}

export async function loadThresholdsEditorDataForSession(): Promise<ThresholdsEditorData> {
  const session = await requireAthlete();
  return loadThresholdsEditorData(session.user.athleteId!);
}

export async function loadThresholdHistoryEditorDataForSession(): Promise<ThresholdHistoryEditorData> {
  const session = await requireAthlete();
  return loadThresholdHistoryEditorData(session.user.athleteId!);
}
