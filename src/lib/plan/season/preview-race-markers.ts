import {
  formatGoalDisciplines,
  type Discipline,
  type GoalEventDraft,
} from "@/lib/plan/season/season-types";
import { parseDateKey } from "@/lib/dates";
import { formatGoalTimeDisplay } from "@/lib/plan/goal-time";
import { resolveEstimatedDurationMinutes } from "@/lib/plan/season/goal-event-times";
import { raceTimelineFraction } from "@/lib/plan/season/season-dates";

export type PreviewRaceMarker = {
  key: string;
  priority: "A" | "B" | "C";
  tooltip: string;
  positionFraction: number;
};

export type RaceMarkerEventInput = {
  name: string;
  date: string;
  priority: "A" | "B" | "C";
  disciplines: Discipline[];
  estimatedDurationMinutes?: number | null;
  swimGoalMinutes?: number | null;
  bikeGoalMinutes?: number | null;
  runGoalMinutes?: number | null;
};

function raceTooltip(event: GoalEventDraft): string {
  const parts = [event.name.trim()];
  if (event.disciplines.length > 0) {
    parts.push(formatGoalDisciplines(event.disciplines));
  }
  const minutes = resolveEstimatedDurationMinutes(event);
  if (minutes != null && minutes > 0) {
    parts.push(formatGoalTimeDisplay(minutes));
  }
  return parts.join(" · ");
}

export function buildRaceMarkersFromGoalEvents(
  seasonStart: Date,
  displayWeeks: number,
  events: RaceMarkerEventInput[]
): PreviewRaceMarker[] {
  return events
    .filter((event) => event.date && event.name.trim())
    .map((event, index) => ({
      key: `${event.priority}-${index}-${event.date}`,
      priority: event.priority,
      tooltip: raceTooltip(event),
      positionFraction: raceTimelineFraction(
        seasonStart,
        parseDateKey(event.date),
        displayWeeks
      ),
    }));
}

export function goalEventsForRaceMarkers(
  primaryGoalEvent:
    | (Omit<RaceMarkerEventInput, "priority"> & { priority?: "A" | "B" | "C" })
    | null
    | undefined,
  goalEvents: RaceMarkerEventInput[] | undefined
): RaceMarkerEventInput[] {
  if (goalEvents && goalEvents.length > 0) {
    return goalEvents;
  }
  if (primaryGoalEvent?.date && primaryGoalEvent.name.trim()) {
    return [{ ...primaryGoalEvent, priority: primaryGoalEvent.priority ?? "A" }];
  }
  return [];
}

export function buildPreviewRaceMarkers(
  seasonStart: Date,
  displayWeeks: number,
  aRace: GoalEventDraft | null | undefined,
  bRaces: GoalEventDraft[],
  cRaces: GoalEventDraft[]
): PreviewRaceMarker[] {
  const events: RaceMarkerEventInput[] = [];
  if (aRace?.date && aRace.name.trim()) {
    events.push({ ...aRace, priority: "A" });
  }
  for (const race of bRaces) {
    if (race.date && race.name.trim()) events.push({ ...race, priority: "B" });
  }
  for (const race of cRaces) {
    if (race.date && race.name.trim()) events.push({ ...race, priority: "C" });
  }
  return buildRaceMarkersFromGoalEvents(seasonStart, displayWeeks, events);
}
