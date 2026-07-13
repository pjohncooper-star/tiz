import type { z } from "zod";
import type { seasonGoalEventSchema } from "@/lib/plan/api-schemas";
import { parseISO, startOfDay } from "date-fns";
import { parseDateKey } from "@/lib/dates";
import type { GoalEventWriteInput } from "@/lib/plan/season/goal-events-sync";

type GoalEventApi = z.infer<typeof seasonGoalEventSchema>;

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

export { parseDateKey };
