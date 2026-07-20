import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { PoolSlotKind } from "@/lib/plan/season/simple-week-compute";
import { isEndurancePoolDiscipline, type PoolDisciplineFilter } from "@/lib/plan/calendar/pool-session-card";
import type { PoolDiscipline } from "@/lib/plan/calendar/unscheduled-chips";

export const GENERATED_POOL_CARD_PREFIX = "generated:";

export function generatedPoolCardId(sessionId: string): string {
  return `${GENERATED_POOL_CARD_PREFIX}${sessionId}`;
}

export function parseGeneratedPoolCardId(cardId: string): string | null {
  if (!cardId.startsWith(GENERATED_POOL_CARD_PREFIX)) return null;
  const sessionId = cardId.slice(GENERATED_POOL_CARD_PREFIX.length);
  return sessionId.length > 0 ? sessionId : null;
}

export function isGeneratedPoolCardId(cardId: string): boolean {
  return parseGeneratedPoolCardId(cardId) != null;
}

export function poolSlotKindForSession(session: CalendarPlannedSession): PoolSlotKind {
  if (session.poolSlotKind) return session.poolSlotKind;
  if (session.sessionRole === "INTENSITY") return "INTENSITY";
  if (session.sessionRole === "LONG") return "LONG";
  return "ENDURANCE";
}

/** Materialized calendar session with no structured workout — eligible for Build / easy TiZ autofill. */
export function isFillableGeneratedSession(session: CalendarPlannedSession): boolean {
  if (session.source !== "TEMPLATE") return false;
  if (session.stepCount > 0) return false;
  return isEndurancePoolDiscipline(session.discipline as PoolDiscipline);
}

export function listFillableGeneratedSessions(
  sessions: CalendarPlannedSession[]
): CalendarPlannedSession[] {
  return sessions.filter(isFillableGeneratedSession);
}

export function fillableGeneratedSessionIds(sessions: CalendarPlannedSession[]): Set<string> {
  return new Set(listFillableGeneratedSessions(sessions).map((session) => session.id));
}

function disciplineMatchesFilter(
  discipline: PoolDiscipline,
  filter: PoolDisciplineFilter
): boolean {
  if (filter === "ALL") return isEndurancePoolDiscipline(discipline);
  return discipline === filter;
}

export function fillableGeneratedSessionsForFilter(
  sessions: CalendarPlannedSession[],
  filter: PoolDisciplineFilter
): CalendarPlannedSession[] {
  return listFillableGeneratedSessions(sessions).filter((session) =>
    disciplineMatchesFilter(session.discipline as PoolDiscipline, filter)
  );
}
