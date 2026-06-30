import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";

export type PlannedSessionGroup =
  | { kind: "single"; session: CalendarPlannedSession }
  | {
      kind: "multisport_race";
      groupId: string;
      title: string;
      scheduledDate: string;
      legs: CalendarPlannedSession[];
      distanceMeters: number | null;
      estimatedDurationMinutes: number | null;
    };

export function groupPlannedSessions(sessions: CalendarPlannedSession[]): PlannedSessionGroup[] {
  const groups = new Map<string, CalendarPlannedSession[]>();
  const standalone: CalendarPlannedSession[] = [];

  for (const session of sessions) {
    if (session.source === "RACE" && session.multisportGroupId) {
      const list = groups.get(session.multisportGroupId) ?? [];
      list.push(session);
      groups.set(session.multisportGroupId, list);
    } else {
      standalone.push(session);
    }
  }

  const result: PlannedSessionGroup[] = standalone.map((session) => ({
    kind: "single",
    session,
  }));

  for (const [groupId, legs] of groups) {
    legs.sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));
    const primary = legs[0]!;
    result.push({
      kind: "multisport_race",
      groupId,
      title: primary.title,
      scheduledDate: primary.scheduledDate,
      legs,
      distanceMeters: primary.distanceMeters,
      estimatedDurationMinutes: primary.estimatedDurationMinutes,
    });
  }

  return result.sort((a, b) => {
    const dateA = a.kind === "single" ? a.session.scheduledDate : a.scheduledDate;
    const dateB = b.kind === "single" ? b.session.scheduledDate : b.scheduledDate;
    return dateA.localeCompare(dateB);
  });
}
