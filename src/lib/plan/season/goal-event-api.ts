import { parseISO, startOfDay } from "date-fns";
import { parseDateKey } from "@/lib/dates";
import type { GoalEventWriteInput, LinkCalendarRaceInput } from "@/lib/plan/season/goal-events-sync";
import type { z } from "zod";
import type { seasonGoalEventSchema, linkCalendarRaceSchema } from "@/lib/plan/api-schemas";
import type { GoalEventDraft } from "@/components/season/season-settings-types";
import { goalEventTimesForApi } from "@/lib/plan/season/goal-event-times";

type GoalEventApi = z.infer<typeof seasonGoalEventSchema>;

export function goalEventDraftPayload(race: GoalEventDraft): GoalEventApi {
  const times = goalEventTimesForApi({
    disciplines: race.disciplines,
    estimatedDurationMinutes: race.estimatedDurationMinutes ?? null,
    swimGoalMinutes: race.swimGoalMinutes ?? null,
    bikeGoalMinutes: race.bikeGoalMinutes ?? null,
    runGoalMinutes: race.runGoalMinutes ?? null,
  });
  return {
    id: race.id,
    name: race.name.trim(),
    date: race.date,
    disciplines: race.disciplines,
    distanceMeters: race.distanceMeters ?? null,
    estimatedDurationMinutes: times.estimatedDurationMinutes,
    swimGoalMinutes: times.swimGoalMinutes,
    bikeGoalMinutes: times.bikeGoalMinutes,
    runGoalMinutes: times.runGoalMinutes,
    taperDaysBefore: race.taperDaysBefore ?? null,
    notes: race.notes ?? null,
  };
}

export function splitRacesForSave(races: GoalEventDraft[], priority: "B" | "C") {
  const complete = races.filter(
    (race) => race.name.trim() && race.date && race.disciplines.length > 0
  );
  const links = complete
    .filter((race) => race.plannedSessionId && !race.id)
    .map((race) => ({
      ...goalEventDraftPayload(race),
      plannedSessionId: race.plannedSessionId!,
      priority,
    }));
  const events = complete
    .filter((race) => !race.plannedSessionId || race.id)
    .map(goalEventDraftPayload);
  return { links, events };
}

export function parseGoalEventWrite(event: GoalEventApi): GoalEventWriteInput {
  return {
    id: event.id,
    name: event.name,
    date: startOfDay(parseISO(`${event.date}T12:00:00`)),
    disciplines: event.disciplines,
    distanceMeters: event.distanceMeters,
    estimatedDurationMinutes: event.estimatedDurationMinutes,
    swimGoalMinutes: event.swimGoalMinutes,
    bikeGoalMinutes: event.bikeGoalMinutes,
    runGoalMinutes: event.runGoalMinutes,
    taperDaysBefore: event.taperDaysBefore,
    notes: event.notes,
  };
}

export function parseLinkCalendarRace(
  link: z.infer<typeof linkCalendarRaceSchema>
): LinkCalendarRaceInput {
  return {
    ...parseGoalEventWrite(link),
    plannedSessionId: link.plannedSessionId,
    priority: link.priority,
  };
}

export { parseDateKey };
