import type { PhaseKind } from "@prisma/client";
import {
  defaultPhaseKindZoneDefaults,
  defaultZoneSplitsForKind,
  resolvePhaseZoneSplits,
  seedPhaseZoneSplits,
} from "@/lib/plan/season/phase-zone-defaults";
import type { PhaseKindZoneDefaults, PhaseZoneSplits } from "@/lib/plan/season/zone-split-types";
import {
  DEFAULT_PHASE_INTENSE_DAYS,
  DEFAULT_PHASE_SESSIONS,
  PHASE_COLORS,
  type SimplePhase,
} from "@/components/simple-planner/simple-planner-types";
import { defaultVolumeSettingsForPhaseKind } from "@/lib/plan/season/phase-volume-settings";
import { newPhaseId } from "@/lib/plan/season/phase-span-utils";
import { suggestPhasesForWeeks } from "@/lib/plan/season/default-phases";

export type { PhaseKindZoneDefaults, PhaseZoneSplits };

export function zoneSplitsForPhase(
  phase: Pick<SimplePhase, "phaseKind" | "zoneSplits">,
  kindDefaults: PhaseKindZoneDefaults
): PhaseZoneSplits {
  return resolvePhaseZoneSplits({
    phaseKind: phase.phaseKind,
    phaseZoneSplits: phase.zoneSplits,
    kindDefaults,
  });
}

export function suggestSimplePhasesForWeeks(
  totalWeeks: number,
  kindDefaults: PhaseKindZoneDefaults = defaultPhaseKindZoneDefaults()
): SimplePhase[] {
  if (totalWeeks <= 0) return [];
  const suggested = suggestPhasesForWeeks(totalWeeks);
  let cursor = 0;
  return suggested.map((phase) => {
    const startWeekIndex = cursor;
    const endWeekIndex = cursor + phase.weekCount - 1;
    cursor = endWeekIndex + 1;
    const volume = defaultVolumeSettingsForPhaseKind(phase.phaseKind);
    return {
      id: newPhaseId(),
      name: phase.name,
      color: phase.color ?? PHASE_COLORS[0] ?? "#38bdf8",
      phaseKind: phase.phaseKind,
      startWeekIndex,
      endWeekIndex,
      rampEnabled: { swim: true, bike: true, run: true },
      ...DEFAULT_PHASE_SESSIONS,
      ...DEFAULT_PHASE_INTENSE_DAYS,
      goal: null,
      volumeTrend: volume.volumeTrend,
      volumeTargetPercent: volume.volumeTargetPercent,
      volumeTaperStartPercent: volume.volumeTaperStartPercent,
      volumeTaperEndPercent: volume.volumeTaperEndPercent,
      longSessionCadence: volume.longSessionCadence,
      suppressRecovery: volume.suppressRecovery,
      zoneSplits: seedPhaseZoneSplits(phase.phaseKind, kindDefaults),
    };
  });
}

export { defaultZoneSplitsForKind };
