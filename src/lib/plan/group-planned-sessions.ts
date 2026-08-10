import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { compareSessionsForDayOrder } from "@/lib/plan/session-day-order";

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

function groupOrderKey(group: PlannedSessionGroup): {
  scheduledDate: string;
  scheduledTimeMinutes: number | null;
  daySortOrder: number;
  title: string;
} {
  if (group.kind === "single") {
    return {
      scheduledDate: group.session.scheduledDate,
      scheduledTimeMinutes: group.session.scheduledTimeMinutes ?? null,
      daySortOrder: group.session.daySortOrder ?? 0,
      title: group.session.title,
    };
  }
  const primary = group.legs[0]!;
  return {
    scheduledDate: group.scheduledDate,
    scheduledTimeMinutes: primary.scheduledTimeMinutes ?? null,
    daySortOrder: primary.daySortOrder ?? 0,
    title: group.title,
  };
}

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
    const keyA = groupOrderKey(a);
    const keyB = groupOrderKey(b);
    if (keyA.scheduledDate !== keyB.scheduledDate) {
      return keyA.scheduledDate.localeCompare(keyB.scheduledDate);
    }
    return compareSessionsForDayOrder(
      {
        id: a.kind === "single" ? a.session.id : a.groupId,
        ...keyA,
      },
      {
        id: b.kind === "single" ? b.session.id : b.groupId,
        ...keyB,
      }
    );
  });
}
