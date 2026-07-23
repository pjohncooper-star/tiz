/**
 * Season template materialization (pure core).
 *
 * Turns per-week template assignments into the concrete list of sessions to
 * write onto the calendar, using the {@link resolveWeekTemplateKind} precedence:
 *
 *   scheduled test week → test template   · TiZ suppressed
 *   de-load / rest week → rest template if set, else phase template · volume-scaled
 *   normal week         → phase template if set, else nothing
 *
 * When planning longs separately, LONG template seats are rewritten from
 * {@link WeekMaterializationContext.bikeLongSeat} / `runLongSeat` (full long,
 * extra intensity, substitute endurance, or omit).
 *
 * No DB access here so it is fully unit-testable; the server layer feeds it
 * plain data and persists the returned session specs.
 */
import type { Discipline, PoolSize, PoolSlotKind, SessionRole, Weekday } from "@prisma/client";
import { weekdayToDate } from "./weekday-to-date";
import {
  resolveWeekTemplateKind,
  type ResolvedTemplateKind,
} from "./week-template-resolution";

export type MaterializeTemplateItem = {
  weekday: Weekday;
  discipline: Discipline;
  title: string;
  durationMinutes: number | null;
  distanceMeters: number | null;
  poolSize: PoolSize | null;
  sessionRole: SessionRole;
};

export type MaterializeTemplate = {
  id: string;
  items: MaterializeTemplateItem[];
};

/** How a reserved long seat is filled when longs are planned separately. */
export type LongSeatAction =
  | { kind: "full_long" }
  | { kind: "extra_intensity" }
  | { kind: "substitute_endurance"; durationMinutes: number }
  | { kind: "omit" };

/** A single week's resolution context. */
export type WeekMaterializationContext = {
  weekIndex: number;
  /** Monday of the week, yyyy-MM-dd. */
  weekStartKey: string;
  isDeLoadWeek: boolean;
  isTestWeek: boolean;
  /** Template assigned to the phase covering this week (or null). */
  phaseTemplateId: string | null;
  /** Separate-longs BIKE LONG seat action (null = leave LONG items unchanged). */
  bikeLongSeat?: LongSeatAction | null;
  /** Separate-longs RUN LONG seat action (null = leave LONG items unchanged). */
  runLongSeat?: LongSeatAction | null;
};

export type MaterializeOptions = {
  restTemplateId: string | null;
  testTemplateId: string | null;
  /** De-load volume as a percent of a normal week (e.g. 75). */
  deLoadVolumePercent: number;
  templatesById: Map<string, MaterializeTemplate>;
};

export type MaterializedSession = {
  scheduledDateKey: string;
  weekday: Weekday;
  discipline: Discipline;
  title: string;
  durationMinutes: number | null;
  distanceMeters: number | null;
  poolSize: PoolSize | null;
  sessionRole: SessionRole;
  poolSlotKind?: PoolSlotKind | null;
  /** When true the session sits outside the TiZ system (test weeks). */
  suppressTiz: boolean;
};

export type WeekMaterializationPlan = {
  weekIndex: number;
  weekStartKey: string;
  kind: ResolvedTemplateKind;
  templateId: string | null;
  sessions: MaterializedSession[];
};

function templateIdForKind(
  kind: ResolvedTemplateKind,
  ctx: WeekMaterializationContext,
  opts: MaterializeOptions
): string | null {
  switch (kind) {
    case "PHASE":
      return ctx.phaseTemplateId;
    case "REST":
      return opts.restTemplateId;
    case "TEST":
      return opts.testTemplateId;
    case "NONE":
      return null;
  }
}

function scaleDuration(minutes: number | null, scale: number): number | null {
  if (minutes == null) return null;
  if (scale >= 1) return minutes;
  return Math.max(1, Math.round(minutes * scale));
}

function longSeatForDiscipline(
  discipline: Discipline,
  ctx: WeekMaterializationContext
): LongSeatAction | null | undefined {
  if (discipline === "BIKE") return ctx.bikeLongSeat;
  if (discipline === "RUN") return ctx.runLongSeat;
  return null;
}

function intensityTitle(title: string, discipline: Discipline): string {
  if (/\blong\b/i.test(title)) {
    return title.replace(/\blong\b/gi, "Intensity");
  }
  return discipline === "BIKE" ? "Intensity ride" : "Intensity run";
}

function enduranceSubstituteTitle(title: string, discipline: Discipline): string {
  if (/\blong\b/i.test(title)) {
    return title.replace(/\blong\b/gi, "Endurance");
  }
  return discipline === "BIKE" ? "Endurance ride" : "Endurance run";
}

/**
 * Apply separate-longs seat policy to a template-derived session.
 * Returns null when the long seat should be omitted for the week.
 */
export function applyLongSeatToSession(
  session: MaterializedSession,
  ctx: WeekMaterializationContext
): MaterializedSession | null {
  if (session.sessionRole !== "LONG") return session;
  if (session.discipline !== "BIKE" && session.discipline !== "RUN") return session;

  const seat = longSeatForDiscipline(session.discipline, ctx);
  if (seat == null) return session;

  switch (seat.kind) {
    case "full_long":
      return { ...session, poolSlotKind: "LONG" };
    case "extra_intensity":
      return {
        ...session,
        title: intensityTitle(session.title, session.discipline),
        sessionRole: "INTENSITY",
        poolSlotKind: "INTENSITY",
      };
    case "substitute_endurance": {
      const durationMinutes =
        seat.durationMinutes > 0
          ? seat.durationMinutes
          : session.durationMinutes;
      return {
        ...session,
        title: enduranceSubstituteTitle(session.title, session.discipline),
        durationMinutes,
        sessionRole: "EASY",
        poolSlotKind: "SUBSTITUTE_ENDURANCE",
      };
    }
    case "omit":
      return null;
  }
}

/** Resolve and expand a single week into concrete session specs. */
export function planWeekMaterialization(
  ctx: WeekMaterializationContext,
  opts: MaterializeOptions
): WeekMaterializationPlan {
  const resolution = resolveWeekTemplateKind({
    isTestWeek: ctx.isTestWeek,
    isDeLoadWeek: ctx.isDeLoadWeek,
    hasPhaseTemplate: ctx.phaseTemplateId != null,
    hasRestTemplate: opts.restTemplateId != null,
    hasTestTemplate: opts.testTemplateId != null,
  });

  const templateId = templateIdForKind(resolution.kind, ctx, opts);
  const template = templateId ? opts.templatesById.get(templateId) : undefined;
  const scale = resolution.deLoadScaled
    ? Math.max(0, Math.min(1, opts.deLoadVolumePercent / 100))
    : 1;

  const sessions: MaterializedSession[] = [];
  for (const item of template?.items ?? []) {
    const base: MaterializedSession = {
      scheduledDateKey: weekdayToDate(ctx.weekStartKey, item.weekday),
      weekday: item.weekday,
      discipline: item.discipline,
      title: item.title,
      // De-load scales duration (the main volume lever); distance is left as-is.
      durationMinutes: scaleDuration(item.durationMinutes, scale),
      distanceMeters: item.distanceMeters,
      poolSize: item.discipline === "SWIM" ? item.poolSize : null,
      sessionRole: item.sessionRole,
      suppressTiz: resolution.suppressTiz,
    };
    const next = applyLongSeatToSession(base, ctx);
    if (next) sessions.push(next);
  }

  return {
    weekIndex: ctx.weekIndex,
    weekStartKey: ctx.weekStartKey,
    kind: resolution.kind,
    templateId: templateId ?? null,
    sessions,
  };
}

/** Plan materialization for every week of a season. */
export function planSeasonMaterialization(
  weeks: WeekMaterializationContext[],
  opts: MaterializeOptions
): WeekMaterializationPlan[] {
  return weeks.map((week) => planWeekMaterialization(week, opts));
}

export type PhaseSpan = {
  startWeekIndex: number;
  endWeekIndex: number;
  weeklyTemplateId: string | null;
};

/** Template id assigned to the phase covering a given week index (or null). */
export function phaseTemplateIdForWeek(
  weekIndex: number,
  phases: PhaseSpan[]
): string | null {
  const phase = phases.find(
    (p) =>
      p.startWeekIndex >= 0 &&
      weekIndex >= p.startWeekIndex &&
      weekIndex <= p.endWeekIndex
  );
  return phase?.weeklyTemplateId ?? null;
}
