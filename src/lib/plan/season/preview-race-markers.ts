import type { GoalEventDraft } from "@/components/season/season-settings-types";
import { parseDateKey } from "@/lib/dates";
import { formatGoalTimeDisplay } from "@/lib/plan/goal-time";
import {
  formatDisciplineGoalTimesSummary,
  resolveEstimatedDurationMinutes,
} from "@/lib/plan/season/goal-event-times";
import { raceTimelineFraction } from "@/lib/plan/season/season-dates";

export type PreviewRaceMarker = {
  key: string;
  priority: "A" | "B" | "C";
  tooltip: string;
  positionFraction: number;
};

function raceTooltip(event: GoalEventDraft): string {
  const name = event.name.trim();
  const legSummary = formatDisciplineGoalTimesSummary(event.disciplines, event);
  const minutes = resolveEstimatedDurationMinutes(event);
  const duration =
    legSummary ?? (minutes != null ? formatGoalTimeDisplay(minutes) : null);
  return duration ? `${name} · ${duration}` : name;
}

function markersForPriority(
  priority: "A" | "B" | "C",
  events: GoalEventDraft[],
  seasonStart: Date,
  displayWeeks: number
): PreviewRaceMarker[] {
  return events
    .map((event, index) => {
      if (!event.date || !event.name.trim()) return null;
      return {
        key: `${priority}-${index}-${event.date}`,
        priority,
        tooltip: raceTooltip(event),
        positionFraction: raceTimelineFraction(
          seasonStart,
          parseDateKey(event.date),
          displayWeeks
        ),
      };
    })
    .filter((marker): marker is PreviewRaceMarker => marker != null);
}

export function buildPreviewRaceMarkers(
  seasonStart: Date,
  displayWeeks: number,
  aRace: GoalEventDraft | null | undefined,
  bRaces: GoalEventDraft[],
  cRaces: GoalEventDraft[]
): PreviewRaceMarker[] {
  const aMarkers =
    aRace?.date && aRace.name.trim()
      ? markersForPriority("A", [aRace], seasonStart, displayWeeks)
      : [];
  return [
    ...aMarkers,
    ...markersForPriority("B", bRaces, seasonStart, displayWeeks),
    ...markersForPriority("C", cRaces, seasonStart, displayWeeks),
  ];
}
