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

export type WeeklyTemplateDto = {
  id: string;
  name: string;
  kind: WeeklyTemplateKind;
  seasonPlanId: string | null;
  seasonPhaseId: string | null;
  items: Array<{
    id: string;
    weekday: Weekday;
    discipline: Discipline;
    title: string;
    durationMinutes: number | null;
    distanceMeters: number | null;
    poolSize: PoolSize | null;
    sessionRole: SessionRole;
    sortOrder: number;
  }>;
};

/**
 * Identifies which template to read or create. `DEFAULT` is the athlete-global
 * template (the /calendar/template quick-apply); `PHASE` is bound to a season
 * phase; `REST` / `TEST` are one per season plan.
 */
export type TemplateScope =
  | { kind: "DEFAULT"; athleteId: string }
  | {
      kind: "PHASE";
      athleteId: string;
      seasonPlanId: string;
      seasonPhaseId: string;
    }
  | { kind: "REST"; athleteId: string; seasonPlanId: string }
  | { kind: "TEST"; athleteId: string; seasonPlanId: string };

const TEMPLATE_ITEM_INCLUDE = {
  items: { orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }] },
} satisfies Prisma.WeeklyScheduleTemplateInclude;

const DEFAULT_TEMPLATE_NAME: Record<WeeklyTemplateKind, string> = {
  DEFAULT: "Weekly template",
  PHASE: "Phase template",
  REST: "Rest week template",
  TEST: "Test week template",
};

function scopeCreateData(scope: TemplateScope) {
  switch (scope.kind) {
    case "DEFAULT":
      return { athleteId: scope.athleteId, kind: "DEFAULT" as const };
    case "PHASE":
      return {
        athleteId: scope.athleteId,
        kind: "PHASE" as const,
        seasonPlanId: scope.seasonPlanId,
        seasonPhaseId: scope.seasonPhaseId,
      };
    case "REST":
      return {
        athleteId: scope.athleteId,
        kind: "REST" as const,
        seasonPlanId: scope.seasonPlanId,
      };
    case "TEST":
      return {
        athleteId: scope.athleteId,
        kind: "TEST" as const,
        seasonPlanId: scope.seasonPlanId,
      };
  }
}

async function findScopedTemplate(scope: TemplateScope) {
  if (scope.kind === "PHASE") {
    return db.weeklyScheduleTemplate.findFirst({
      where: { seasonPhaseId: scope.seasonPhaseId, kind: "PHASE" },
      include: TEMPLATE_ITEM_INCLUDE,
    });
  }
  if (scope.kind === "DEFAULT") {
    return db.weeklyScheduleTemplate.findFirst({
      where: { athleteId: scope.athleteId, kind: "DEFAULT" },
      include: TEMPLATE_ITEM_INCLUDE,
    });
  }
  return db.weeklyScheduleTemplate.findFirst({
    where: { seasonPlanId: scope.seasonPlanId, kind: scope.kind },
    include: TEMPLATE_ITEM_INCLUDE,
  });
}

/** Read or lazily create the template for a scope. */
export async function getOrCreateScopedTemplate(
  scope: TemplateScope
): Promise<WeeklyTemplateDto> {
  let template = await findScopedTemplate(scope);
  if (!template) {
    template = await db.weeklyScheduleTemplate.create({
      data: { ...scopeCreateData(scope), name: DEFAULT_TEMPLATE_NAME[scope.kind] },
      include: TEMPLATE_ITEM_INCLUDE,
    });
  }
  return serializeTemplate(template);
}

/** Read the template for a scope without creating it. */
export async function getScopedTemplate(
  scope: TemplateScope
): Promise<WeeklyTemplateDto | null> {
  const template = await findScopedTemplate(scope);
  return template ? serializeTemplate(template) : null;
}

/** All plan-scoped templates (PHASE / REST / TEST) for a season plan. */
export async function getPlanWeeklyTemplates(
  seasonPlanId: string
): Promise<WeeklyTemplateDto[]> {
  const templates = await db.weeklyScheduleTemplate.findMany({
    where: { seasonPlanId },
    include: TEMPLATE_ITEM_INCLUDE,
  });
  return templates.map(serializeTemplate);
}

export async function getOrCreateWeeklyTemplate(
  athleteId: string
): Promise<WeeklyTemplateDto> {
  return getOrCreateScopedTemplate({ kind: "DEFAULT", athleteId });
}

function serializeTemplate(template: {
  id: string;
  name: string;
  kind: WeeklyTemplateKind;
  seasonPlanId: string | null;
  seasonPhaseId: string | null;
  items: Array<{
    id: string;
    weekday: Weekday;
    discipline: Discipline;
    title: string;
    durationMinutes: number | null;
    distanceMeters: number | null;
    poolSize: PoolSize | null;
    sessionRole: SessionRole;
    sortOrder: number;
  }>;
}): WeeklyTemplateDto {
  return {
    id: template.id,
    name: template.name,
    kind: template.kind,
    seasonPlanId: template.seasonPlanId,
    seasonPhaseId: template.seasonPhaseId,
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

export async function replaceScopedTemplate(
  scope: TemplateScope,
  name: string,
  items: WeeklyTemplateItemInput[]
): Promise<WeeklyTemplateDto> {
  const template = await getOrCreateScopedTemplate(scope);

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
          sessionRole: item.sessionRole ?? inferSessionRole({
            title: item.title.trim(),
            discipline: item.discipline,
            durationMinutes: item.durationMinutes ?? null,
          }),
          sortOrder: item.sortOrder ?? index,
        })),
      });
    }
  });

  return getScopedTemplate(scope) as Promise<WeeklyTemplateDto>;
}

export async function replaceWeeklyTemplate(
  athleteId: string,
  name: string,
  items: WeeklyTemplateItemInput[]
): Promise<WeeklyTemplateDto> {
  return replaceScopedTemplate({ kind: "DEFAULT", athleteId }, name, items);
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
