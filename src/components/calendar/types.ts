import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";

export type CalendarRangeData = {
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  weekStarts: string[];
};

export type ApplyTemplateMode = "clear_week" | "clear_template_days" | "merge";

export type WeeklyTemplateItem = {
  id?: string;
  weekday: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  discipline: "BIKE" | "RUN" | "SWIM" | "STRENGTH";
  title: string;
  durationMinutes: number | null;
  distanceMeters: number | null;
  poolSize: "SCY" | "SCM" | "LCM" | null;
  sortOrder: number;
};

export type WeeklyTemplate = {
  id: string;
  name: string;
  items: WeeklyTemplateItem[];
};
