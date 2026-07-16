import type { PlanningMode } from "@prisma/client";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { WeekSlotBudgets } from "@/lib/plan/season/simple-week-compute";

export type TargetDiscipline = "SWIM" | "BIKE" | "RUN";

export type CalendarWeekTargetDiscipline = {
  discipline: TargetDiscipline;
  hours: number;
  /** Zone minutes keyed `DISCIPLINE-zone` (e.g. RUN-4) for this discipline. */
  zoneMinutes: Record<string, number>;
  sessionsPerWeek: number;
  intenseDaysPerWeek: number;
};

export type CalendarWeekTarget = {
  /** Monday date key (yyyy-MM-dd). */
  weekStart: string;
  weekIndex: number;
  isRestWeek: boolean;
  totalHours: number;
  phase: { name: string; color: string } | null;
  strengthSessionsPerWeek: number;
  planningMode?: PlanningMode;
  longRideMinutes?: number;
  longRunMinutes?: number;
  longSessionZoneMinutes?: Record<string, number>;
  slotBudgets?: WeekSlotBudgets;
  byDiscipline: CalendarWeekTargetDiscipline[];
  /** All-discipline zone minutes keyed `DISCIPLINE-zone`. */
  zoneMinutes: Record<string, number>;
};

export type CalendarRangeData = {
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  weekStarts: string[];
  weekTargets: CalendarWeekTarget[];
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
  sessionRole: "EASY" | "MODERATE" | "INTENSITY" | "LONG";
  sortOrder: number;
};

export type WeeklyTemplate = {
  id: string;
  name: string;
  items: WeeklyTemplateItem[];
};
