import { Prisma } from "@prisma/client";
import type {
  Discipline,
  Weekday,
  PoolSize,
  SessionRole,
  WeeklyTemplateKind,
} from "@prisma/client";
import { normalizeWeekStart, parseDateKey, WEEK_OPTS } from "@/lib/dates";
import { db } from "@/lib/db";
import { weekdayToDate } from "@/lib/plan/calendar/weekday-to-date";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import { inferSessionRole } from "@/lib/plan/session-role";
import { addDays, addWeeks, format, parseISO, startOfWeek } from "date-fns";

export type ApplyTemplateMode = "clear_week" | "clear_template_days" | "merge";

export type WeeklyTemplateItemInput = {
  weekday: Weekday;
  discipline: Discipline;
  title: string;
  durationMinutes?: number | null;
  distanceMeters?: number | null;
  poolSize?: PoolSize | null;
  sessionRole?: SessionRole;
  sortOrder?: number;
};

export type WeeklyTemplateItemDto = {
  id: string;
  weekday: Weekday;
  discipline: Discipline;
  title: string;
  durationMinutes: number | null;
  distanceMeters: number | null;
  poolSize: PoolSize | null;
  sessionRole: SessionRole;
  sortOrder: number;
};

export type WeeklyTemplateDto = {
  id: string;
  name: string;
  category: WeeklyTemplateKind;
  items: WeeklyTemplateItemDto[];
};

/** Lightweight template descriptor for pickers / lists (no items). */
export type WeeklyTemplateSummary = {
  id: string;
  name: string;
  category: WeeklyTemplateKind;
  itemCount: number;
};

const TEMPLATE_ITEM_INCLUDE = {
  items: { orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }] },
} satisfies Prisma.WeeklyScheduleTemplateInclude;

type TemplateWithItems = Prisma.WeeklyScheduleTemplateGetPayload<{
  include: typeof TEMPLATE_ITEM_INCLUDE;
}>;

function serializeTemplate(template: TemplateWithItems): WeeklyTemplateDto {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    items: template.items.map((item) => ({
      id: item.id,
      weekday: item.weekday,
      discipline: item.discipline,
      title: item.title,
      durationMinutes: item.durationMinutes,
      distanceMeters: item.distanceMeters,
      poolSize: item.poolSize,
      sessionRole: item.sessionRole,
      sortOrder: item.sortOrder,
    })),
  };
}

function templateItemCreateData(items: WeeklyTemplateItemInput[]) {
  return items.map((item, index) => ({
    weekday: item.weekday,
    discipline: item.discipline,
    title: item.title.trim(),
    durationMinutes: item.durationMinutes ?? null,
    distanceMeters: item.distanceMeters ?? null,
    poolSize: item.discipline === "SWIM" ? (item.poolSize ?? null) : null,
    sessionRole:
      item.sessionRole ??
      inferSessionRole({
        title: item.title.trim(),
        discipline: item.discipline,
        durationMinutes: item.durationMinutes ?? null,
      }),
    sortOrder: item.sortOrder ?? index,
  }));
}

// ---------------------------------------------------------------------------
// Library CRUD
// ---------------------------------------------------------------------------

/** All templates in the athlete's reusable library. */
export async function listWeeklyTemplates(
  athleteId: string
): Promise<WeeklyTemplateDto[]> {
  const templates = await db.weeklyScheduleTemplate.findMany({
    where: { athleteId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: TEMPLATE_ITEM_INCLUDE,
  });
  return templates.map(serializeTemplate);
}

/** Summaries (no items) for pickers — e.g. phase / rest / test assignment. */
export async function listWeeklyTemplateSummaries(
  athleteId: string
): Promise<WeeklyTemplateSummary[]> {
  const templates = await db.weeklyScheduleTemplate.findMany({
    where: { athleteId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      _count: { select: { items: true } },
    },
  });
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    itemCount: t._count.items,
  }));
}

export async function getWeeklyTemplate(
  athleteId: string,
  id: string
): Promise<WeeklyTemplateDto | null> {
  const template = await db.weeklyScheduleTemplate.findFirst({
    where: { id, athleteId },
    include: TEMPLATE_ITEM_INCLUDE,
  });
  return template ? serializeTemplate(template) : null;
}

export async function createWeeklyTemplate(
  athleteId: string,
  input: { name: string; category?: WeeklyTemplateKind; items?: WeeklyTemplateItemInput[] }
): Promise<WeeklyTemplateDto> {
  const template = await db.weeklyScheduleTemplate.create({
    data: {
      athleteId,
      name: input.name.trim() || "Weekly template",
      category: input.category ?? "DEFAULT",
      items: input.items?.length
        ? { create: templateItemCreateData(input.items) }
        : undefined,
    },
    include: TEMPLATE_ITEM_INCLUDE,
  });
  return serializeTemplate(template);
}

/** Replace a template's name / category / items. Scoped to the owner. */
export async function updateWeeklyTemplate(
  athleteId: string,
  id: string,
  input: { name?: string; category?: WeeklyTemplateKind; items: WeeklyTemplateItemInput[] }
): Promise<WeeklyTemplateDto> {
  const existing = await db.weeklyScheduleTemplate.findFirst({
    where: { id, athleteId },
    select: { id: true },
  });
  if (!existing) throw new Error("Template not found");

  await db.$transaction(async (tx) => {
    await tx.weeklyScheduleTemplate.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.trim() || "Weekly template" } : {}),
        ...(input.category != null ? { category: input.category } : {}),
      },
    });
    await tx.weeklyScheduleTemplateItem.deleteMany({ where: { templateId: id } });
    if (input.items.length > 0) {
      await tx.weeklyScheduleTemplateItem.createMany({
        data: templateItemCreateData(input.items).map((item) => ({
          ...item,
          templateId: id,
        })),
      });
    }
  });

  const updated = await getWeeklyTemplate(athleteId, id);
  if (!updated) throw new Error("Template not found");
  return updated;
}

export async function deleteWeeklyTemplate(
  athleteId: string,
  id: string
): Promise<void> {
  const result = await db.weeklyScheduleTemplate.deleteMany({
    where: { id, athleteId },
  });
  if (result.count === 0) throw new Error("Template not found");
}

// ---------------------------------------------------------------------------
// Apply a template to a calendar week
// ---------------------------------------------------------------------------

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
  templateId: string,
  weekStart: string,
  mode: ApplyTemplateMode
): Promise<{ created: number }> {
  const template = await getWeeklyTemplate(athleteId, templateId);
  if (!template) {
    throw new Error("Template not found");
  }
  if (template.items.length === 0) {
    throw new Error("Template has no sessions");
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

      const sessionRole =
        item.sessionRole ??
        inferSessionRole({
          title: item.title,
          discipline: item.discipline,
          durationMinutes: item.durationMinutes,
        });

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
          sessionRole,
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
