import type { WeekActivity, WeekActivityGroup } from "@/components/dashboard-week-view";

export function groupWeekActivities(activities: WeekActivity[]): WeekActivityGroup[] {
  const groups = new Map<string, WeekActivity[]>();
  const standalone: WeekActivity[] = [];

  for (const a of activities) {
    if (a.multisportGroupId) {
      const list = groups.get(a.multisportGroupId) ?? [];
      list.push(a);
      groups.set(a.multisportGroupId, list);
    } else {
      standalone.push(a);
    }
  }

  const result: WeekActivityGroup[] = standalone.map((activity) => ({
    kind: "single",
    activity,
  }));

  for (const [groupId, legs] of groups) {
    legs.sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));
    result.push({
      kind: "multisport",
      groupId,
      startTime: legs[0].startTime,
      totalDurationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
      legs,
    });
  }

  return result.sort((a, b) => {
    const ta = a.kind === "single" ? a.activity.startTime : a.startTime;
    const tb = b.kind === "single" ? b.activity.startTime : b.startTime;
    return ta.localeCompare(tb);
  });
}
