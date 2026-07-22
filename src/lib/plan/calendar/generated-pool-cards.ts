import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { PoolSlotKind } from "@/lib/plan/season/simple-week-compute";
import {
  isEndurancePoolDiscipline,
  mergeChipsWithDrafts,
  type PoolCardDraftMap,
  type PoolDisciplineFilter,
  type PoolSessionCard,
} from "@/lib/plan/calendar/pool-session-card";
import type { PoolDiscipline, UnscheduledChip } from "@/lib/plan/calendar/unscheduled-chips";

export const GENERATED_POOL_CARD_PREFIX = "generated:";
export const STAGING_POOL_CARD_PREFIX = "staging:";

const STAGING_DISCIPLINES = ["SWIM", "BIKE", "RUN"] as const;
export type StagingPoolDiscipline = (typeof STAGING_DISCIPLINES)[number];

export function stagingPoolCardId(discipline: StagingPoolDiscipline): string {
  return `${STAGING_POOL_CARD_PREFIX}${discipline}`;
}

export function parseStagingPoolCardId(cardId: string): StagingPoolDiscipline | null {
  if (!cardId.startsWith(STAGING_POOL_CARD_PREFIX)) return null;
  const discipline = cardId.slice(STAGING_POOL_CARD_PREFIX.length);
  return STAGING_DISCIPLINES.includes(discipline as StagingPoolDiscipline)
    ? (discipline as StagingPoolDiscipline)
    : null;
}

export function isStagingPoolCardId(cardId: string): boolean {
  return parseStagingPoolCardId(cardId) != null;
}

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

/** Pool draft keys that target a fillable generated PlannedSession. */
export function generatedSessionDraftEntries<T>(
  drafts: Record<string, T>
): Array<{ cardId: string; sessionId: string; draft: T }> {
  const out: Array<{ cardId: string; sessionId: string; draft: T }> = [];
  for (const [cardId, draft] of Object.entries(drafts)) {
    const sessionId = parseGeneratedPoolCardId(cardId);
    if (!sessionId) continue;
    out.push({ cardId, sessionId, draft });
  }
  return out;
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

/** Endurance non-race session that already has a structured workout — eligible for Edit. */
export function isEditableCalendarSession(session: CalendarPlannedSession): boolean {
  if (session.source === "RACE") return false;
  if (session.stepCount <= 0) return false;
  return isEndurancePoolDiscipline(session.discipline as PoolDiscipline);
}

/** Session can be bound as the Build/Edit graph target (empty fillable or filled editable). */
export function isComposableCalendarSession(session: CalendarPlannedSession): boolean {
  return isFillableGeneratedSession(session) || isEditableCalendarSession(session);
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

export function generatedSessionToPoolCard(
  session: CalendarPlannedSession,
  draft?: PoolCardDraftMap[string]
): PoolSessionCard {
  const cardId = generatedPoolCardId(session.id);
  const targetDurationMinutes =
    session.estimatedDurationMinutes != null && session.estimatedDurationMinutes > 0
      ? session.estimatedDurationMinutes
      : session.totalMinutes > 0
        ? session.totalMinutes
        : undefined;

  return {
    id: cardId,
    discipline: session.discipline as PoolDiscipline,
    label: session.title,
    slotKind: poolSlotKindForSession(session),
    ...(targetDurationMinutes != null ? { targetDurationMinutes } : {}),
    ...(draft ? { draft } : {}),
  };
}

export function resolveSelectedPoolCard(
  selectedCardId: string | null,
  chips: UnscheduledChip[],
  drafts: PoolCardDraftMap,
  sessions: CalendarPlannedSession[]
): PoolSessionCard | null {
  if (!selectedCardId) return null;

  const chipCard = mergeChipsWithDrafts(chips, drafts).find((card) => card.id === selectedCardId);
  if (chipCard) return chipCard;

  const stagingDiscipline = parseStagingPoolCardId(selectedCardId);
  if (stagingDiscipline) {
    return {
      id: selectedCardId,
      discipline: stagingDiscipline,
      slotKind: "ENDURANCE",
      label: "Duplicated workout",
    };
  }

  const sessionId = parseGeneratedPoolCardId(selectedCardId);
  if (!sessionId) return null;

  const session = sessions.find((row) => row.id === sessionId);
  if (!session || !isComposableCalendarSession(session)) return null;

  return generatedSessionToPoolCard(session, drafts[selectedCardId]);
}

export function applyTargetSessionId(selectedCardId: string | null): string | null {
  if (!selectedCardId) return null;
  return parseGeneratedPoolCardId(selectedCardId);
}
