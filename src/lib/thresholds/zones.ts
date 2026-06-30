import type { SignalType } from "@prisma/client";

export function zoneBoundariesFor(signalType: SignalType): number[] {
  if (signalType === "POWER") return [55, 75, 90, 105, 120];
  if (signalType === "PACE") return [90, 97, 100, 110, 120];
  return [68, 83, 94, 100, 106];
}
