import type { Discipline } from "@prisma/client";
import type { WeekActivity } from "@/components/dashboard-week-view";
import { zoneKey, type ZoneMinutes } from "@/lib/workout/steps";

export type CalendarWeekActivity = WeekActivity & {
  distanceMeters: number | null;
  zoneMinutes: ZoneMinutes;
};

type ActivityRow = {
  id: string;
  name: string;
  startTime: Date;
  discipline: Discipline;
  source: string;
  noUsableSignal: boolean;
  durationSeconds: number;
  distanceMeters: number | null;
  multisportGroupId: string | null;
  sessionIndex: number | null;
  legType: string | null;
  zoneBreakdowns: Array<{
    zone: number;
    minutes: number;
    signalUsed: string;
    isCanonical: boolean;
  }>;
};

export function serializeCalendarActivities(activities: ActivityRow[]): CalendarWeekActivity[] {
  return activities.map((activity) => {
    const zoneMinutes: ZoneMinutes = {};
    for (const zb of activity.zoneBreakdowns) {
      if (!zb.isCanonical) continue;
      const key = zoneKey(activity.discipline, zb.zone);
      zoneMinutes[key] = (zoneMinutes[key] ?? 0) + zb.minutes;
    }

    return {
      id: activity.id,
      name: activity.name,
      startTime: activity.startTime.toISOString(),
      discipline: activity.discipline,
      source: activity.source,
      signalUsed: activity.zoneBreakdowns[0]?.signalUsed ?? null,
      noUsableSignal: activity.noUsableSignal,
      durationSeconds: activity.durationSeconds,
      distanceMeters: activity.distanceMeters,
      zoneMinutes,
      multisportGroupId: activity.multisportGroupId,
      sessionIndex: activity.sessionIndex,
      legType: activity.legType,
    };
  });
}
