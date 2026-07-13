import type { Discipline, SignalType } from "@prisma/client";
import {
  zoneBoundariesFor as zoneBoundariesForDiscipline,
  zoneBoundariesForSignal,
} from "@/lib/zones/boundaries";

/** Preferred: discipline + signal aware defaults. */
export function zoneBoundariesFor(
  disciplineOrSignal: Discipline | SignalType,
  signalType?: SignalType
): number[] {
  if (signalType != null) {
    return zoneBoundariesForDiscipline(
      disciplineOrSignal as Discipline,
      signalType
    );
  }
  return zoneBoundariesForSignal(disciplineOrSignal as SignalType);
}
