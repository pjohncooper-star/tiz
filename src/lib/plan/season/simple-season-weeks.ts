import type { SimpleWeek } from "@/components/simple-planner/simple-planner-types";
import { formatDateKey, parseDateKey } from "@/lib/dates";
import { fitSimplePhasesToTotalWeeks } from "./phase-span-utils";
import type { SimpleRampDefaults } from "./simple-ramp";
import {
  buildSeasonDateBounds,
  weekStartDateForIndex,
} from "./season-dates";
import { roundHours } from "./volume-curve";
import type { SimplePhase } from "@/components/simple-planner/simple-planner-types";

function roundTotal(swimHours: number, bikeHours: number, runHours: number): number {
  return roundHours(swimHours + bikeHours + runHours);
}

export function resizeSimpleWeeksForTotalWeeks(
  weeks: SimpleWeek[],
  totalWeeks: number,
  rampDefaults: SimpleRampDefaults,
  seasonStart: Date
): SimpleWeek[] {
  const resized: SimpleWeek[] = [];

  for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
    const prior = weeks[weekIndex];
    const weekStartDate = formatDateKey(weekStartDateForIndex(seasonStart, weekIndex));

    if (prior) {
      resized.push({
        ...prior,
        weekIndex,
        weekStartDate,
        totalHours: roundTotal(prior.swimHours, prior.bikeHours, prior.runHours),
      });
      continue;
    }

    const swimHours = rampDefaults.swim.startHours;
    const bikeHours = rampDefaults.bike.startHours;
    const runHours = rampDefaults.run.startHours;
    resized.push({
      weekIndex,
      weekStartDate,
      isRestWeek: false,
      swimHours,
      bikeHours,
      runHours,
      totalHours: roundTotal(swimHours, bikeHours, runHours),
      swimDistanceMeters:
        rampDefaults.swim.mode === "DISTANCE" ? rampDefaults.swim.startDistanceMeters : null,
      runDistanceMeters:
        rampDefaults.run.mode === "DISTANCE" ? rampDefaults.run.startDistanceMeters : null,
      zoneMinutes: {},
      zoneMinutesOverridden: false,
    });
  }

  return resized;
}

export function applySimpleSeasonDateBounds(input: {
  startDate: string;
  endDate: string;
  totalWeeks: number;
  phases: SimplePhase[];
  weeks: SimpleWeek[];
  rampDefaults: SimpleRampDefaults;
}): {
  startDate: string;
  endDate: string;
  totalWeeks: number;
  phases: SimplePhase[];
  weeks: SimpleWeek[];
} {
  const bounds = buildSeasonDateBounds(
    parseDateKey(input.startDate),
    parseDateKey(input.endDate)
  );

  return {
    startDate: formatDateKey(bounds.startDate),
    endDate: formatDateKey(bounds.endDate),
    totalWeeks: bounds.totalWeeks,
    phases: fitSimplePhasesToTotalWeeks(input.phases, bounds.totalWeeks),
    weeks: resizeSimpleWeeksForTotalWeeks(
      input.weeks,
      bounds.totalWeeks,
      input.rampDefaults,
      bounds.startDate
    ),
  };
}
