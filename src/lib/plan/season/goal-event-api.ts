import { parseISO, startOfDay } from "date-fns";
import { parseDateKey } from "@/lib/dates";
import type { GoalEventWriteInput, LinkCalendarRaceInput } from "@/lib/plan/season/goal-events-sync";
import type { z } from "zod";
import type { seasonGoalEventSchema, linkCalendarRaceSchema } from "@/lib/plan/api-schemas";

type GoalEventApi = z.infer<typeof seasonGoalEventSchema>;

export function parseGoalEventWrite(event: GoalEventApi): GoalEventWriteInput {
  return {
    id: event.id,
    name: event.name,
    date: startOfDay(parseISO(`${event.date}T12:00:00`)),
    disciplines: event.disciplines,
    distanceMeters: event.distanceMeters,
    estimatedDurationMinutes: event.estimatedDurationMinutes,
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
