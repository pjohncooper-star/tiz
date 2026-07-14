import { activityLocalDateKey, eachDateKey, nextDateKey } from "@/lib/dates";

/** Population-default fitness time constant (days). */
export const DEFAULT_TAU1 = 42;
/** Population-default fatigue time constant (days). */
export const DEFAULT_TAU2 = 7;

export type IrDiscipline = "SWIM" | "BIKE" | "RUN";

export const IR_DISCIPLINES: IrDiscipline[] = ["SWIM", "BIKE", "RUN"];

export type DisciplineTau = {
  tau1: number;
  tau2: number;
};

export type FitnessFatigueTaus = Record<IrDiscipline, DisciplineTau>;

export const DEFAULT_TAUS: FitnessFatigueTaus = {
  SWIM: { tau1: DEFAULT_TAU1, tau2: DEFAULT_TAU2 },
  BIKE: { tau1: DEFAULT_TAU1, tau2: DEFAULT_TAU2 },
  RUN: { tau1: DEFAULT_TAU1, tau2: DEFAULT_TAU2 },
};

export type EcoImpulse = {
  startTime: Date;
  utcOffsetSeconds?: number | null;
  discipline: string;
  ecos: number;
};

export type DisciplineDayState = {
  w: number;
  g: number;
  h: number;
  /** Per-sport form: g − h (k1 = k2 = 1). */
  form: number;
};

export type FitnessFatiguePoint = {
  date: string;
  swim: DisciplineDayState;
  bike: DisciplineDayState;
  run: DisciplineDayState;
  /** Combined form: sum of per-sport (g − h). */
  form: number;
};

function emptyDay(): DisciplineDayState {
  return { w: 0, g: 0, h: 0, form: 0 };
}

function isIrDiscipline(d: string): d is IrDiscipline {
  return d === "SWIM" || d === "BIKE" || d === "RUN";
}

function decay(prev: number, tau: number): number {
  if (!(tau > 0) || !Number.isFinite(prev)) return 0;
  return prev * Math.exp(-1 / tau);
}

type DailyW = Record<IrDiscipline, number>;

function emptyW(): DailyW {
  return { SWIM: 0, BIKE: 0, RUN: 0 };
}

/**
 * Sum ECO impulses onto activity-local calendar days per swim/bike/run.
 */
export function buildDailyLoadByDiscipline(
  impulses: EcoImpulse[]
): Map<string, DailyW> {
  const byDay = new Map<string, DailyW>();
  for (const impulse of impulses) {
    if (!isIrDiscipline(impulse.discipline)) continue;
    if (!(impulse.ecos > 0) || !Number.isFinite(impulse.ecos)) continue;
    const key = activityLocalDateKey(impulse.startTime, impulse.utcOffsetSeconds);
    const row = byDay.get(key) ?? emptyW();
    row[impulse.discipline] += impulse.ecos;
    byDay.set(key, row);
  }
  return byDay;
}

export type ComputeFitnessFatigueOptions = {
  /** Inclusive start (yyyy-MM-dd). Defaults to first impulse local day. */
  from?: string;
  /** Inclusive end (yyyy-MM-dd). Defaults to last impulse local day (or today). */
  to?: string;
  taus?: FitnessFatigueTaus;
};

/**
 * Banister-style recursive fitness/fatigue per discipline.
 * Same-day impulse: g(t) = g(t−1)·e^(−1/τ1) + w(t), likewise for h.
 * Combined form is Σ(g_d − h_d); never blends ECO before decay.
 */
export function computeFitnessFatigue(
  impulses: EcoImpulse[],
  options: ComputeFitnessFatigueOptions = {}
): FitnessFatiguePoint[] {
  const daily = buildDailyLoadByDiscipline(impulses);
  if (daily.size === 0) return [];

  const keys = [...daily.keys()].sort();
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  const responseFrom = options.from ?? first;
  const responseTo = options.to ?? last;
  if (responseFrom > responseTo) return [];

  // Warm-start from the first ECO local day even if the response window starts later.
  const computeEnd = responseTo < first ? first : responseTo;
  const taus = options.taus ?? DEFAULT_TAUS;
  const g: Record<IrDiscipline, number> = { SWIM: 0, BIKE: 0, RUN: 0 };
  const h: Record<IrDiscipline, number> = { SWIM: 0, BIKE: 0, RUN: 0 };
  const series: FitnessFatiguePoint[] = [];

  for (const date of eachDateKey(first, computeEnd)) {
    const w = daily.get(date) ?? emptyW();
    const swim = stepDiscipline(g, h, "SWIM", w.SWIM, taus.SWIM);
    const bike = stepDiscipline(g, h, "BIKE", w.BIKE, taus.BIKE);
    const run = stepDiscipline(g, h, "RUN", w.RUN, taus.RUN);
    if (date < responseFrom || date > responseTo) continue;
    series.push({
      date,
      swim,
      bike,
      run,
      form: swim.form + bike.form + run.form,
    });
  }

  return series;
}

function stepDiscipline(
  g: Record<IrDiscipline, number>,
  h: Record<IrDiscipline, number>,
  d: IrDiscipline,
  w: number,
  tau: DisciplineTau
): DisciplineDayState {
  g[d] = decay(g[d], tau.tau1) + w;
  h[d] = decay(h[d], tau.tau2) + w;
  return {
    w,
    g: g[d],
    h: h[d],
    form: g[d] - h[d],
  };
}

/** Convenience: today as UTC yyyy-MM-dd. */
export function utcTodayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export { nextDateKey };
