import type { Discipline, Weekday, PoolSize } from "@prisma/client";
import { normalizeWeekStart, parseDateKey, WEEK_OPTS } from "@/lib/dates";
import { db } from "@/lib/db";
import { weekdayToDate } from "@/lib/plan/calendar/weekday-to-date";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import { addDays, addWeeks, format, parseISO, startOfWeek } from "date-fns";

export type ApplyTemplateMode = "clear_week" | "clear_template_days" | "merge";

export type WeeklyTemplateItemInput = {
  weekday: Weekday;
  discipline: Discipline;
  title: string;
  durationMinutes?: number | null;
  distanceMeters?: number | null;
  poolSize?: PoolSize | null;
  sortOrder?: number;
};

export type WeeklyTemplateDto = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    weekday: Weekday;
    discipline: Discipline;
    title: string;
    durationMinutes: number | null;
    distanceMeters: number | null;
    poolSize: PoolSize | null;
    sortOrder: number;
  }>;
};

export async function getOrCreateWeeklyTemplate(athleteId: string): Promise<WeeklyTemplateDto> {
  let template = await db.weeklyScheduleTemplate.findUnique({
    where: { athleteId },
    include: { items: { orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }] } },
  });

  if (!template) {
    template = await db.weeklyScheduleTemplate.create({
      data: { athleteId },
      include: { items: { orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }] } },
    });
  }

  return serializeTemplate(template);
}

function serializeTemplate(template: {
  id: string;
  name: string;
  items: Array<{
    id: string;
    weekday: Weekday;
    discipline: Discipline;
    title: string;
    durationMinutes: number | null;
    distanceMeters: number | null;
    poolSize: PoolSize | null;
    sortOrder: number;
  }>;
}): WeeklyTemplateDto {
  return {
    id: template.id,
    name: template.name,
    items: template.items.map((item) => ({
      id: item.id,
      weekday: item.weekday,
      discipline: item.discipline,
      title: item.title,
      durationMinutes: item.durationMinutes,
      distanceMeters: item.distanceMeters,
      poolSize: item.poolSize,
      sortOrder: item.sortOrder,
    })),
  };
}

export async function replaceWeeklyTemplate(
  athleteId: string,
  name: string,
  items: WeeklyTemplateItemInput[]
): Promise<WeeklyTemplateDto> {
  const template = await getOrCreateWeeklyTemplate(athleteId);

  await db.$transaction(async (tx) => {
    await tx.weeklyScheduleTemplate.update({
      where: { id: template.id },
      data: { name },
    });
    await tx.weeklyScheduleTemplateItem.deleteMany({ where: { templateId: template.id } });
    if (items.length > 0) {
      await tx.weeklyScheduleTemplateItem.createMany({
        data: items.map((item, index) => ({
          templateId: template.id,
          weekday: item.weekday,
          discipline: item.discipline,
          title: item.title.trim(),
          durationMinutes: item.durationMinutes ?? null,
          distanceMeters: item.distanceMeters ?? null,
          poolSize: item.discipline === "SWIM" ? (item.poolSize ?? null) : null,
          sortOrder: item.sortOrder ?? index,
        })),
      });
    }
  });

  return getOrCreateWeeklyTemplate(athleteId);
}

export async function weekHasPlannedSessions(
  athleteId: string,
  weekStart: string
): Promise<boolean> {
  const mondayKey = normalizeWeekStart(weekStart);
  const start = parseDateKey(mondayKey);
  const end = parseDateKey(format(addDays(start, 6), "yyyy-MM-dd"));
  const count = await db.plannedSession.count({
    where: {
      athleteId,
      scheduledDate: { gte: start, lte: end },
    },
  });
  return count > 0;
}

export async function applyWeeklyTemplate(
  athleteId: string,
  weekStart: string,
  mode: ApplyTemplateMode
): Promise<{ created: number }> {
  const template = await getOrCreateWeeklyTemplate(athleteId);
  if (template.items.length === 0) {
    throw new Error("Weekly template has no sessions");
  }

  const mondayKey = normalizeWeekStart(weekStart);
  const weekStartDate = parseDateKey(mondayKey);
  const weekEndDate = parseDateKey(format(addDays(weekStartDate, 6), "yyyy-MM-dd"));
  const templateWeekdays = new Set(template.items.map((i) => i.weekday));

  await db.$transaction(async (tx) => {
    if (mode === "clear_week") {
      await tx.plannedSession.deleteMany({
        where: {
          athleteId,
          scheduledDate: { gte: weekStartDate, lte: weekEndDate },
        },
      });
    } else if (mode === "clear_template_days") {
      const dates = [...templateWeekdays].map((weekday) =>
        parseDateKey(weekdayToDate(mondayKey, weekday))
      );
      await tx.plannedSession.deleteMany({
        where: {
          athleteId,
          source: "TEMPLATE",
          scheduledDate: { in: dates },
        },
      });
    }

    for (const item of template.items) {
      const scheduledDate = parseDateKey(weekdayToDate(mondayKey, item.weekday));
      const targetZones =
        item.durationMinutes && item.durationMinutes > 0
          ? { "2": item.durationMinutes }
          : undefined;
      const zoneAllocationMissing = computeZoneAllocationMissing(
        item.discipline,
        targetZones
      );

      await tx.plannedSession.create({
        data: {
          athleteId,
          scheduledDate,
          discipline: item.discipline,
          title: item.title,
          distanceMeters: item.distanceMeters,
          poolSize: item.discipline === "SWIM" ? item.poolSize : null,
          source: "TEMPLATE",
          weeklyTemplateItemId: item.id,
          targetZones,
          zoneAllocationMissing,
        },
      });
    }
  });

  return { created: template.items.length };
}

export function weekStartsInRange(from: string, to: string): string[] {
  const rangeStart = startOfWeek(parseISO(`${from}T12:00:00`), WEEK_OPTS);
  const rangeEnd = parseDateKey(to);
  const weeks: string[] = [];
  let cursor = rangeStart;
  while (cursor <= rangeEnd) {
    weeks.push(format(cursor, "yyyy-MM-dd"));
    cursor = addWeeks(cursor, 1);
  }
  return weeks;
}
