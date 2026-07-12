import type { PhaseKind, VolumeMesocycleMode } from "@prisma/client";
import {
  RACE_PREP_VOLUME_FACTOR,
  TAPER_VOLUME_END_FACTOR,
  TAPER_VOLUME_START_FACTOR,
} from "./constants";
import { defaultVolumeMesocycleMode } from "./phase-volume-ramp";

export type SimplePhaseVolumeTrend = VolumeMesocycleMode | "TAPER";

export type LongSessionCadence = "EVERY_WEEK" | "EVERY_OTHER" | "NONE";

export type PhaseVolumeSettings = {
  volumeTrend: SimplePhaseVolumeTrend;
  volumeTargetPercent: number;
  volumeTaperStartPercent: number;
  volumeTaperEndPercent: number;
  longSessionCadence: LongSessionCadence;
  suppressRecovery: boolean;
};

export const DEFAULT_PHASE_VOLUME_SETTINGS: PhaseVolumeSettings = {
  volumeTrend: "INCREASE",
  volumeTargetPercent: 100,
  volumeTaperStartPercent: Math.round(TAPER_VOLUME_START_FACTOR * 100),
  volumeTaperEndPercent: Math.round(TAPER_VOLUME_END_FACTOR * 100),
  longSessionCadence: "EVERY_OTHER",
  suppressRecovery: false,
};

export function defaultVolumeSettingsForPhaseKind(phaseKind: PhaseKind): PhaseVolumeSettings {
  switch (phaseKind) {
    case "BASE":
      return {
        ...DEFAULT_PHASE_VOLUME_SETTINGS,
        volumeTrend: "INCREASE",
        volumeTargetPercent: 100,
        longSessionCadence: "EVERY_OTHER",
        suppressRecovery: false,
      };
    case "BUILD":
      return {
        ...DEFAULT_PHASE_VOLUME_SETTINGS,
        volumeTrend: "HOLD",
        volumeTargetPercent: 100,
        longSessionCadence: "EVERY_WEEK",
        suppressRecovery: false,
      };
    case "RACE_PREP":
      return {
        ...DEFAULT_PHASE_VOLUME_SETTINGS,
        volumeTrend: "DECREASE",
        volumeTargetPercent: Math.round(RACE_PREP_VOLUME_FACTOR * 100),
        longSessionCadence: "EVERY_WEEK",
        suppressRecovery: false,
      };
    case "TAPER":
      return {
        ...DEFAULT_PHASE_VOLUME_SETTINGS,
        volumeTrend: "TAPER",
        volumeTargetPercent: Math.round(TAPER_VOLUME_END_FACTOR * 100),
        volumeTaperStartPercent: Math.round(TAPER_VOLUME_START_FACTOR * 100),
        volumeTaperEndPercent: Math.round(TAPER_VOLUME_END_FACTOR * 100),
        longSessionCadence: "NONE",
        suppressRecovery: true,
      };
  }
}

export function inferPhaseKindFromName(name: string): PhaseKind {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("taper")) return "TAPER";
  if (normalized.includes("race") || normalized.includes("prep")) return "RACE_PREP";
  if (normalized.includes("build")) return "BUILD";
  return "BASE";
}

export function defaultVolumeSettingsForPhaseName(name: string): PhaseVolumeSettings {
  return defaultVolumeSettingsForPhaseKind(inferPhaseKindFromName(name));
}

export function resolvePhaseVolumeSettings(input: {
  volumeTrend?: SimplePhaseVolumeTrend | null;
  volumeTargetPercent?: number | null;
  volumeTaperStartPercent?: number | null;
  volumeTaperEndPercent?: number | null;
  longSessionCadence?: LongSessionCadence | null;
  suppressRecovery?: boolean | null;
  phaseKind?: PhaseKind | null;
  name?: string | null;
}): PhaseVolumeSettings {
  const fallback =
    input.phaseKind != null
      ? defaultVolumeSettingsForPhaseKind(input.phaseKind)
      : defaultVolumeSettingsForPhaseName(input.name ?? "Base");

  const volumeTrend =
    input.volumeTrend ??
    (input.phaseKind != null
      ? defaultVolumeSettingsForPhaseKind(input.phaseKind).volumeTrend
      : fallback.volumeTrend);

  return {
    volumeTrend,
    volumeTargetPercent: clampPercent(input.volumeTargetPercent, fallback.volumeTargetPercent),
    volumeTaperStartPercent: clampPercent(
      input.volumeTaperStartPercent,
      fallback.volumeTaperStartPercent
    ),
    volumeTaperEndPercent: clampPercent(
      input.volumeTaperEndPercent,
      fallback.volumeTaperEndPercent
    ),
    longSessionCadence: parseLongSessionCadence(
      input.longSessionCadence,
      fallback.longSessionCadence
    ),
    suppressRecovery: input.suppressRecovery ?? fallback.suppressRecovery,
  };
}

export function volumeMesocycleModeToDb(
  volumeTrend: SimplePhaseVolumeTrend
): VolumeMesocycleMode {
  return volumeTrend === "TAPER" ? "HOLD" : volumeTrend;
}

export function volumeTrendFromDb(
  volumeMesocycleMode: VolumeMesocycleMode,
  isTaperVolume: boolean
): SimplePhaseVolumeTrend {
  if (isTaperVolume) return "TAPER";
  return volumeMesocycleMode;
}

export function inferPhaseKindFromVolumeSettings(settings: PhaseVolumeSettings): PhaseKind {
  if (settings.volumeTrend === "TAPER") return "TAPER";
  if (settings.volumeTrend === "DECREASE") return "RACE_PREP";
  if (settings.volumeTrend === "HOLD") return "BUILD";
  return "BASE";
}

function clampPercent(value: number | null | undefined, fallback: number): number {
  const num = value ?? fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(150, Math.round(num)));
}

function parseLongSessionCadence(
  value: LongSessionCadence | null | undefined,
  fallback: LongSessionCadence
): LongSessionCadence {
  if (value === "EVERY_WEEK" || value === "EVERY_OTHER" || value === "NONE") {
    return value;
  }
  return fallback;
}

/** @deprecated Use resolvePhaseVolumeSettings */
export function legacyVolumeTrendFromPhaseKind(phaseKind: PhaseKind): SimplePhaseVolumeTrend {
  const mode = defaultVolumeMesocycleMode(phaseKind);
  return phaseKind === "TAPER" ? "TAPER" : mode;
}
