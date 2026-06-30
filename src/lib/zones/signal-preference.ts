import type { Discipline, SignalType, SignalPreference } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_DISCIPLINE_SIGNALS } from "@/lib/zones/defaults";

export type SignalPreferenceSnapshot = {
  primarySignal: SignalType;
  fallbackSignal: SignalType | null;
};

const BIKE_PRIMARY: SignalType[] = ["POWER", "HEART_RATE"];
const RUN_PRIMARY: SignalType[] = ["PACE", "HEART_RATE"];

export function allowedPrimarySignals(discipline: Discipline): SignalType[] {
  if (discipline === "BIKE") return BIKE_PRIMARY;
  if (discipline === "RUN") return RUN_PRIMARY;
  if (discipline === "SWIM") return ["PACE"];
  return ["HEART_RATE"];
}

export function deriveFallbackSignal(
  discipline: Discipline,
  primarySignal: SignalType
): SignalType | null {
  if (discipline === "SWIM") return null;
  if (discipline === "BIKE") {
    return primarySignal === "POWER" ? "HEART_RATE" : "POWER";
  }
  if (discipline === "RUN") {
    return primarySignal === "PACE" ? "HEART_RATE" : "PACE";
  }
  return null;
}

export function validatePrimarySignal(
  discipline: Discipline,
  primarySignal: SignalType
): void {
  if (!allowedPrimarySignals(discipline).includes(primarySignal)) {
    throw new Error(`Invalid primary signal ${primarySignal} for ${discipline}`);
  }
}

export function preferenceSnapshot(
  discipline: Discipline,
  primarySignal: SignalType
): SignalPreferenceSnapshot {
  validatePrimarySignal(discipline, primarySignal);
  return {
    primarySignal,
    fallbackSignal: deriveFallbackSignal(discipline, primarySignal),
  };
}

export function signalTypeToTargetView(
  signal: SignalType
): "zone" | "pace_power" | "heart_rate" {
  if (signal === "HEART_RATE") return "heart_rate";
  return "pace_power";
}

export function signalTypeToTargetSignal(signal: SignalType): "power" | "pace" | "heart_rate" {
  if (signal === "POWER") return "power";
  if (signal === "HEART_RATE") return "heart_rate";
  return "pace";
}

export async function getSignalPreferenceAtDate(
  athleteId: string,
  discipline: Discipline,
  activityDate: Date
): Promise<SignalPreferenceSnapshot | null> {
  const row = await db.signalPreference.findFirst({
    where: {
      athleteId,
      discipline,
      effectiveDate: { lte: activityDate },
    },
    orderBy: { effectiveDate: "desc" },
  });
  if (!row) return null;
  return {
    primarySignal: row.primarySignal,
    fallbackSignal: row.fallbackSignal,
  };
}

export async function getPreferenceDateRange(
  preference: Pick<SignalPreference, "athleteId" | "discipline" | "effectiveDate">
): Promise<{ from: Date; to: Date | null }> {
  const next = await db.signalPreference.findFirst({
    where: {
      athleteId: preference.athleteId,
      discipline: preference.discipline,
      effectiveDate: { gt: preference.effectiveDate },
    },
    orderBy: { effectiveDate: "asc" },
    select: { effectiveDate: true },
  });
  return {
    from: preference.effectiveDate,
    to: next?.effectiveDate ?? null,
  };
}

export async function syncCurrentPreferenceToSettings(
  athleteId: string,
  discipline: Discipline
): Promise<void> {
  const latest = await db.signalPreference.findFirst({
    where: { athleteId, discipline },
    orderBy: { effectiveDate: "desc" },
  });
  if (!latest) return;
  await db.athleteDisciplineSettings.update({
    where: { athleteId_discipline: { athleteId, discipline } },
    data: {
      primarySignal: latest.primarySignal,
      fallbackSignal: latest.fallbackSignal,
    },
  });
}

export async function upsertSignalPreference(
  athleteId: string,
  discipline: Discipline,
  primarySignal: SignalType,
  effectiveDate: Date
): Promise<SignalPreference> {
  const { fallbackSignal } = preferenceSnapshot(discipline, primarySignal);
  const row = await db.signalPreference.upsert({
    where: {
      athleteId_discipline_effectiveDate: {
        athleteId,
        discipline,
        effectiveDate,
      },
    },
    create: {
      athleteId,
      discipline,
      primarySignal,
      fallbackSignal,
      effectiveDate,
    },
    update: {
      primarySignal,
      fallbackSignal,
    },
  });
  await syncCurrentPreferenceToSettings(athleteId, discipline);
  return row;
}

export async function resolveSignalSettingsForDate(
  athleteId: string,
  discipline: Discipline,
  activityDate: Date,
  staticSettings: SignalPreferenceSnapshot | null
): Promise<SignalPreferenceSnapshot> {
  const dated = await getSignalPreferenceAtDate(athleteId, discipline, activityDate);
  if (dated) return dated;
  if (staticSettings) {
    return {
      primarySignal: staticSettings.primarySignal,
      fallbackSignal: staticSettings.fallbackSignal,
    };
  }
  const defaults = DEFAULT_DISCIPLINE_SIGNALS[discipline];
  return {
    primarySignal: defaults.primary,
    fallbackSignal: defaults.fallback,
  };
}
