import type { WeekActivityGroup } from "@/components/dashboard-week-view";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";

export function linkedActivityIdsFromSessions(sessions: CalendarPlannedSession[]): Set<string> {
  const ids = new Set<string>();
  for (const session of sessions) {
    if (session.linkedActivity) {
      ids.add(session.linkedActivity.id);
    }
  }
  return ids;
}

export function filterUnlinkedActivityGroups(
  groups: WeekActivityGroup[],
  linkedIds: Set<string>
): WeekActivityGroup[] {
  if (linkedIds.size === 0) return groups;

  const result: WeekActivityGroup[] = [];

  for (const group of groups) {
    if (group.kind === "single") {
      if (!linkedIds.has(group.activity.id)) {
        result.push(group);
      }
      continue;
    }

    const legs = group.legs.filter((leg) => !linkedIds.has(leg.id));
    if (legs.length === 0) continue;
    if (legs.length === group.legs.length) {
      result.push(group);
      continue;
    }
    result.push({
      kind: "multisport",
      groupId: group.groupId,
      startTime: legs[0].startTime,
      totalDurationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
      legs,
    });
  }

  return result;
}
