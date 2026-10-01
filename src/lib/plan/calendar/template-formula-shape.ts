import type { Discipline, SessionRole, WorkoutShapeKind } from "@prisma/client";
import { distributeMinutes } from "@/lib/plan/season/base-formulas";
import type {
  DisciplineFormula,
  FormulaDiscipline,
  FormulaSession,
  FormulaZone,
} from "@/lib/plan/season/base-formulas";
import {
  primarySignalForDiscipline,
  rollupTreeToZoneMinutes,
  totalTreeDurationMinutes,
  WORKOUT_TREE_VERSION,
  type LeafStep,
  type StepIntensity,
  type TargetSignal,
  type WorkoutNode,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";
import type { ZoneMinutes } from "@/lib/workout/workout-types";

export const DEFAULT_WARMUP_SECONDS = 600;
export const DEFAULT_COOLDOWN_SECONDS = 300;
export const DEFAULT_MIN_REPS = 1;
export const DEFAULT_REST_SECONDS = 60;

const FORMULA_DISCIPLINES: FormulaDiscipline[] = ["SWIM", "BIKE", "RUN"];

export type FormulaShapeKind = WorkoutShapeKind | "STEADY" | "FIXED";

export type FormulaTemplateItem = {
  discipline: Discipline;
  sessionRole: SessionRole;
  sharePercent?: number | null;
  zone?: number | null;
  shapeKind?: FormulaShapeKind | null;
  workSeconds?: number | null;
  restSeconds?: number | null;
  minReps?: number | null;
  warmupSeconds?: number | null;
  cooldownSeconds?: number | null;
  durationMinutes?: number | null;
};

export type ResolvedFormulaSession = {
  durationMinutes: number;
  targetZones: ZoneMinutes;
  tree: WorkoutTreeDocument;
  label: string;
  reps: number | null;
  leftoverSeconds: number;
};

export function isFormulaDiscipline(
  discipline: Discipline
): discipline is FormulaDiscipline {
  return FORMULA_DISCIPLINES.includes(discipline as FormulaDiscipline);
}

export function templateDisciplineHasMix(
  items: FormulaTemplateItem[] | undefined,
  discipline: FormulaDiscipline
): boolean {
  return (items ?? []).some(
    (item) =>
      item.discipline === discipline &&
      item.sharePercent != null &&
      Number.isFinite(item.sharePercent) &&
      item.sharePercent > 0
  );
}

export function shareTotalForDiscipline(
  items: FormulaTemplateItem[],
  discipline: FormulaDiscipline
): number {
  return items
    .filter((item) => item.discipline === discipline)
    .reduce((sum, item) => sum + (item.sharePercent ?? 0), 0);
}

export function mixShareError(
  items: FormulaTemplateItem[],
  discipline: FormulaDiscipline
): string | null {
  if (!templateDisciplineHasMix(items, discipline)) return null;
  const total = shareTotalForDiscipline(items, discipline);
  if (Math.abs(total - 100) > 0.5) {
    return `${discipline.toLowerCase()} shares total ${Math.round(total)}% (need 100%)`;
  }
  return null;
}

function clampZone(zone: number | null | undefined, fallback: number): FormulaZone {
  const value = zone == null || !Number.isFinite(zone) ? fallback : Math.round(zone);
  if (value <= 1) return 1;
  if (value >= 5) return 5;
  return value as FormulaZone;
}

export function defaultZoneForRole(role: SessionRole): number {
  if (role === "INTENSITY") return 3;
  if (role === "EASY") return 1;
  return 2;
}

function warmupSecondsOf(item: FormulaTemplateItem): number {
  return item.warmupSeconds != null && item.warmupSeconds >= 0
    ? item.warmupSeconds
    : DEFAULT_WARMUP_SECONDS;
}

function cooldownSecondsOf(item: FormulaTemplateItem): number {
  return item.cooldownSeconds != null && item.cooldownSeconds >= 0
    ? item.cooldownSeconds
    : DEFAULT_COOLDOWN_SECONDS;
}

function minRepsOf(item: FormulaTemplateItem): number {
  if (item.minReps != null && item.minReps > 0) return Math.round(item.minReps);
  return DEFAULT_MIN_REPS;
}

function restSecondsOf(item: FormulaTemplateItem): number {
  if (item.restSeconds != null && item.restSeconds >= 0) return item.restSeconds;
  return DEFAULT_REST_SECONDS;
}

function shapeKindOf(item: FormulaTemplateItem): "STEADY" | "FIXED" {
  if (item.shapeKind === "FIXED" && item.workSeconds != null && item.workSeconds > 0) {
    return "FIXED";
  }
  return "STEADY";
}

function stepNode(
  intensity: StepIntensity,
  signal: TargetSignal,
  zone: number,
  seconds: number
): LeafStep {
  return {
    kind: "step",
    intensity,
    duration: { type: "time", value: Math.max(1, Math.round(seconds)) },
    target: { signal, mode: "zone", zone },
  };
}

function formatIntervalLength(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins > 0 && secs === 0) return `${mins}'`;
  if (mins === 0) return `${secs}"`;
  return `${mins}'${secs.toString().padStart(2, "0")}"`;
}

function mainSetSeconds(workSeconds: number, restSeconds: number, reps: number): number {
  if (reps <= 0) return 0;
  return reps * workSeconds + Math.max(0, reps - 1) * restSeconds;
}

function addRepCost(workSeconds: number, restSeconds: number, currentReps: number): number {
  if (currentReps <= 0) return workSeconds;
  return workSeconds + restSeconds;
}

function groupClockSeconds(slots: FormulaTemplateItem[], counts: number[]): number {
  let sum = 0;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    sum +=
      warmupSecondsOf(slot) +
      cooldownSecondsOf(slot) +
      mainSetSeconds(slot.workSeconds ?? 0, restSecondsOf(slot), counts[i] ?? 0);
  }
  return sum;
}

/**
 * Norwegian Singles packer: start at minReps, promote toward the longest
 * interval, otherwise add a shortest-interval rep so a later promote is possible.
 */
export function packFixedGroup(
  slots: FormulaTemplateItem[],
  groupClockSecondsBudget: number
): number[] {
  const n = slots.length;
  const counts = slots.map((slot) => minRepsOf(slot));
  if (n === 0) return counts;

  const order = slots
    .map((slot, index) => ({ index, work: slot.workSeconds ?? 0 }))
    .sort((a, b) => a.work - b.work || a.index - b.index);

  const shortest = order[0]!.index;
  const middle = n >= 2 ? order[1]!.index : shortest;
  const longest = order[n - 1]!.index;

  const fits = (next: number[]) => groupClockSeconds(slots, next) <= groupClockSecondsBudget;

  if (!fits(counts)) return counts;

  const clone = (source: number[]) => source.slice();

  while (true) {
    if (n >= 3) {
      const promoted = clone(counts);
      if (
        promoted[shortest]! > minRepsOf(slots[shortest]!) &&
        promoted[middle]! > minRepsOf(slots[middle]!)
      ) {
        promoted[shortest]! -= 1;
        promoted[middle]! -= 1;
        promoted[longest]! += 1;
        if (fits(promoted)) {
          counts[shortest] = promoted[shortest]!;
          counts[middle] = promoted[middle]!;
          counts[longest] = promoted[longest]!;
          continue;
        }
      }

      const shortWork = slots[shortest]!.workSeconds ?? 0;
      const midWork = slots[middle]!.workSeconds ?? 0;
      if (
        shortWork > 0 &&
        midWork === shortWork * 2 &&
        counts[shortest]! >= minRepsOf(slots[shortest]!) + 2
      ) {
        const converted = clone(counts);
        converted[shortest]! -= 2;
        converted[middle]! += 1;
        if (fits(converted)) {
          counts[shortest] = converted[shortest]!;
          counts[middle] = converted[middle]!;
          continue;
        }
      }
    }

    let added = false;
    for (const { index } of order) {
      const next = clone(counts);
      const cost = addRepCost(
        slots[index]!.workSeconds ?? 0,
        restSecondsOf(slots[index]!),
        next[index]!
      );
      if (cost <= 0) continue;
      next[index]! += 1;
      if (fits(next)) {
        counts[index] = next[index]!;
        added = true;
        break;
      }
    }
    if (!added) break;
  }

  return counts;
}

function buildSteadyTree(input: {
  discipline: FormulaDiscipline;
  zone: FormulaZone;
  sessionSeconds: number;
  warmupSeconds: number;
  cooldownSeconds: number;
}): { tree: WorkoutTreeDocument; leftoverSeconds: number } {
  const signal = primarySignalForDiscipline(input.discipline);
  let warmup = input.warmupSeconds;
  let cooldown = input.cooldownSeconds;
  let main = input.sessionSeconds - warmup - cooldown;
  if (main < 0) {
    const scale = input.sessionSeconds / Math.max(1, warmup + cooldown);
    warmup = Math.floor(warmup * scale);
    cooldown = Math.max(0, input.sessionSeconds - warmup);
    main = 0;
  }
  const leftover = 0;
  const nodes: WorkoutNode[] = [];
  if (warmup > 0) nodes.push(stepNode("warmup", signal, 2, warmup));
  if (main > 0) nodes.push(stepNode("active", signal, input.zone, main));
  if (cooldown > 0) nodes.push(stepNode("cooldown", signal, 1, cooldown));
  return { tree: { version: WORKOUT_TREE_VERSION, nodes }, leftoverSeconds: leftover };
}

function buildFixedTree(input: {
  discipline: FormulaDiscipline;
  zone: FormulaZone;
  workSeconds: number;
  restSeconds: number;
  reps: number;
  warmupSeconds: number;
  cooldownSeconds: number;
  extraWarmupSeconds: number;
}): WorkoutTreeDocument {
  const signal = primarySignalForDiscipline(input.discipline);
  const nodes: WorkoutNode[] = [];
  const warmup = input.warmupSeconds + Math.max(0, input.extraWarmupSeconds);
  if (warmup > 0) nodes.push(stepNode("warmup", signal, 2, warmup));
  if (input.reps > 0 && input.workSeconds > 0) {
    if (input.reps === 1 || input.restSeconds <= 0) {
      nodes.push(stepNode("interval", signal, input.zone, input.workSeconds * input.reps));
    } else {
      nodes.push({
        kind: "repeat",
        repeatCount: input.reps - 1,
        children: [
          stepNode("interval", signal, input.zone, input.workSeconds),
          stepNode("recovery", signal, 1, input.restSeconds),
        ],
      });
      nodes.push(stepNode("interval", signal, input.zone, input.workSeconds));
    }
  }
  if (input.cooldownSeconds > 0) {
    nodes.push(stepNode("cooldown", signal, 1, input.cooldownSeconds));
  }
  return { version: WORKOUT_TREE_VERSION, nodes };
}

function resolvedFromTree(
  tree: WorkoutTreeDocument,
  label: string,
  reps: number | null,
  leftoverSeconds: number
): ResolvedFormulaSession {
  const targetZones = rollupTreeToZoneMinutes(tree);
  return {
    durationMinutes: totalTreeDurationMinutes(tree.nodes),
    targetZones,
    tree,
    label,
    reps,
    leftoverSeconds,
  };
}

function resolveSteady(
  item: FormulaTemplateItem,
  discipline: FormulaDiscipline,
  sessionSeconds: number
): ResolvedFormulaSession {
  const zone = clampZone(item.zone, defaultZoneForRole(item.sessionRole));
  const { tree, leftoverSeconds } = buildSteadyTree({
    discipline,
    zone,
    sessionSeconds,
    warmupSeconds: warmupSecondsOf(item),
    cooldownSeconds: cooldownSecondsOf(item),
  });
  return resolvedFromTree(tree, `Z${zone} steady`, null, leftoverSeconds);
}

function resolveFixedSolo(
  item: FormulaTemplateItem,
  discipline: FormulaDiscipline,
  sessionSeconds: number
): ResolvedFormulaSession {
  const zone = clampZone(item.zone, defaultZoneForRole(item.sessionRole));
  const work = item.workSeconds ?? 0;
  const counts = packFixedGroup([item], sessionSeconds);
  const reps = counts[0] ?? minRepsOf(item);
  const used =
    warmupSecondsOf(item) +
    cooldownSecondsOf(item) +
    mainSetSeconds(work, restSecondsOf(item), reps);
  const leftover = Math.max(0, sessionSeconds - used);
  const tree = buildFixedTree({
    discipline,
    zone,
    workSeconds: work,
    restSeconds: restSecondsOf(item),
    reps,
    warmupSeconds: warmupSecondsOf(item),
    cooldownSeconds: cooldownSecondsOf(item),
    extraWarmupSeconds: leftover,
  });
  const label = `${reps}×${formatIntervalLength(work)} Z${zone}`;
  return resolvedFromTree(tree, label, reps, leftover);
}

function resolveFixedGroup(
  slots: Array<{ item: FormulaTemplateItem; index: number; sessionSeconds: number }>,
  discipline: FormulaDiscipline
): Map<number, ResolvedFormulaSession> {
  const groupClock = slots.reduce((sum, slot) => sum + slot.sessionSeconds, 0);
  const items = slots.map((slot) => slot.item);
  const counts = packFixedGroup(items, groupClock);
  const used = groupClockSeconds(items, counts);
  let leftover = Math.max(0, groupClock - used);
  const extra = items.map(() => 0);
  let cursor = 0;
  while (leftover > 0 && extra.length > 0) {
    extra[cursor % extra.length]! += 1;
    leftover -= 1;
    cursor += 1;
  }

  const out = new Map<number, ResolvedFormulaSession>();
  slots.forEach((slot, i) => {
    const item = slot.item;
    const zone = clampZone(item.zone, defaultZoneForRole(item.sessionRole));
    const work = item.workSeconds ?? 0;
    const reps = counts[i] ?? minRepsOf(item);
    const tree = buildFixedTree({
      discipline,
      zone,
      workSeconds: work,
      restSeconds: restSecondsOf(item),
      reps,
      warmupSeconds: warmupSecondsOf(item),
      cooldownSeconds: cooldownSecondsOf(item),
      extraWarmupSeconds: extra[i] ?? 0,
    });
    const label = `${reps}×${formatIntervalLength(work)} Z${zone}`;
    out.set(slot.index, resolvedFromTree(tree, label, reps, extra[i] ?? 0));
  });
  return out;
}

export function resolveTemplateFormulaWeek(
  items: FormulaTemplateItem[],
  hoursByDiscipline: Partial<Record<FormulaDiscipline, number>>
): Array<ResolvedFormulaSession | null> {
  const resolved: Array<ResolvedFormulaSession | null> = items.map(() => null);

  for (const discipline of FORMULA_DISCIPLINES) {
    const hours = hoursByDiscipline[discipline];
    if (hours == null || hours <= 0) continue;
    const rows = items
      .map((item, index) => ({ item, index }))
      .filter((row) => row.item.discipline === discipline);
    if (!templateDisciplineHasMix(rows.map((row) => row.item), discipline)) continue;

    const shares = rows.map((row) => row.item.sharePercent ?? 0);
    const minutes = distributeMinutes(Math.max(0, Math.round(hours * 60)), shares);

    const pendingFixed: Array<{
      item: FormulaTemplateItem;
      index: number;
      sessionSeconds: number;
      zone: number;
    }> = [];

    rows.forEach((row, rowIndex) => {
      const sessionSeconds = (minutes[rowIndex] ?? 0) * 60;
      if (sessionSeconds <= 0) return;
      if (shapeKindOf(row.item) === "FIXED") {
        pendingFixed.push({
          item: row.item,
          index: row.index,
          sessionSeconds,
          zone: clampZone(row.item.zone, defaultZoneForRole(row.item.sessionRole)),
        });
        return;
      }
      resolved[row.index] = resolveSteady(row.item, discipline, sessionSeconds);
    });

    const groups = new Map<number, typeof pendingFixed>();
    for (const slot of pendingFixed) {
      const list = groups.get(slot.zone) ?? [];
      list.push(slot);
      groups.set(slot.zone, list);
    }
    for (const group of groups.values()) {
      if (group.length === 1) {
        const slot = group[0]!;
        resolved[slot.index] = resolveFixedSolo(
          slot.item,
          discipline,
          slot.sessionSeconds
        );
      } else {
        const packed = resolveFixedGroup(group, discipline);
        for (const [index, session] of packed) {
          resolved[index] = session;
        }
      }
    }
  }

  return resolved;
}

export function templateFormulaZoneMinutes(
  items: FormulaTemplateItem[],
  discipline: FormulaDiscipline,
  hours: number
): Record<FormulaZone, number> {
  const zoneMinutes: Record<FormulaZone, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const resolved = resolveTemplateFormulaWeek(items, { [discipline]: hours });
  items.forEach((item, index) => {
    if (item.discipline !== discipline) return;
    const session = resolved[index];
    if (!session) return;
    for (const [key, minutes] of Object.entries(session.targetZones)) {
      const zone = Number(key) as FormulaZone;
      if (zone >= 1 && zone <= 5) zoneMinutes[zone] += minutes;
    }
  });
  return zoneMinutes;
}

export function templateFormulaSlotOverride(
  items: FormulaTemplateItem[],
  discipline: FormulaDiscipline
): { sessions: number; intense: number; hasLong: boolean } | null {
  const rows = items.filter(
    (item) =>
      item.discipline === discipline && item.sharePercent != null && item.sharePercent > 0
  );
  if (rows.length === 0) return null;
  return {
    sessions: rows.length,
    intense: rows.filter((item) => item.sessionRole === "INTENSITY").length,
    hasLong: rows.some((item) => item.sessionRole === "LONG"),
  };
}

export function templateFormulaLongMinutes(
  items: FormulaTemplateItem[],
  discipline: FormulaDiscipline,
  hours: number
): number {
  const resolved = resolveTemplateFormulaWeek(items, { [discipline]: hours });
  let minutes = 0;
  items.forEach((item, index) => {
    if (item.discipline !== discipline || item.sessionRole !== "LONG") return;
    minutes += resolved[index]?.durationMinutes ?? 0;
  });
  return minutes;
}

const WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export type PairableTemplateItem = FormulaTemplateItem & {
  weekday?: string;
  sortOrder?: number;
};

export type CatalogPairing = {
  pairs: Array<{ itemIndex: number; session: FormulaSession }>;
  /** Formula sessions with no template slot to land on. */
  missing: FormulaSession[];
  /** Template slots of this sport the formula does not cover. */
  extra: number[];
};

function weekdayRank(weekday: string | undefined): number {
  const index = weekday ? WEEKDAY_ORDER.indexOf(weekday) : -1;
  return index < 0 ? WEEKDAY_ORDER.length : index;
}

/**
 * Pair formula sessions to the template's slots for that sport: long slots take
 * long sessions, intensity slots take intensity sessions, then the rest fill in
 * week order.
 */
export function planCatalogPairing(
  items: PairableTemplateItem[],
  formula: DisciplineFormula
): CatalogPairing {
  const rows = items
    .map((item, index) => ({ item, index }))
    .filter((row) => row.item.discipline === formula.discipline)
    .sort(
      (a, b) =>
        weekdayRank(a.item.weekday) - weekdayRank(b.item.weekday) ||
        (a.item.sortOrder ?? 0) - (b.item.sortOrder ?? 0) ||
        a.index - b.index
    );

  const used = new Array(formula.sessions.length).fill(false);
  const take = (predicate: (session: FormulaSession) => boolean) => {
    const found = formula.sessions.findIndex(
      (session, index) => !used[index] && predicate(session)
    );
    if (found < 0) return null;
    used[found] = true;
    return formula.sessions[found]!;
  };

  const assigned = new Map<number, FormulaSession>();
  const passes: Array<{
    role: SessionRole | null;
    predicate: (session: FormulaSession) => boolean;
  }> = [
    { role: "LONG", predicate: (s) => s.long },
    { role: "INTENSITY", predicate: (s) => s.intensity && !s.long },
    { role: null, predicate: () => true },
  ];
  for (const pass of passes) {
    for (const row of rows) {
      if (assigned.has(row.index)) continue;
      if (pass.role && row.item.sessionRole !== pass.role) continue;
      const session = take(pass.predicate);
      if (session) assigned.set(row.index, session);
    }
  }

  return {
    pairs: rows
      .filter((row) => assigned.has(row.index))
      .map((row) => ({ itemIndex: row.index, session: assigned.get(row.index)! })),
    missing: formula.sessions.filter((_, index) => !used[index]),
    extra: rows.filter((row) => !assigned.has(row.index)).map((row) => row.index),
  };
}

export function sessionRoleForFormulaSession(session: FormulaSession): SessionRole {
  if (session.long) return "LONG";
  if (session.intensity) return "INTENSITY";
  if (session.zone <= 1) return "EASY";
  return "MODERATE";
}

export function stampFormulaSession<T extends FormulaTemplateItem>(
  item: T,
  session: FormulaSession
): T {
  const intensity = session.intensity && !session.long;
  return {
    ...item,
    sharePercent: session.sharePercent,
    zone: session.zone,
    shapeKind: intensity ? "FIXED" : "STEADY",
    workSeconds: intensity ? item.workSeconds ?? 360 : null,
    restSeconds: intensity ? item.restSeconds ?? DEFAULT_REST_SECONDS : null,
    minReps: intensity ? item.minReps ?? DEFAULT_MIN_REPS : null,
  };
}

/** Stamp paired slots; extra slots of the sport drop back to duration-based. */
export function applyCatalogPairing<T extends FormulaTemplateItem>(
  items: T[],
  pairing: CatalogPairing
): T[] {
  const byIndex = new Map(pairing.pairs.map((pair) => [pair.itemIndex, pair.session]));
  const extra = new Set(pairing.extra);
  return items.map((item, index) => {
    const session = byIndex.get(index);
    if (session) return stampFormulaSession(item, session);
    if (extra.has(index)) return { ...item, sharePercent: null };
    return item;
  });
}

export function applyCatalogFormulaToItems<T extends PairableTemplateItem>(
  items: T[],
  formula: DisciplineFormula
): T[] | { error: string } {
  const pairing = planCatalogPairing(items, formula);
  if (pairing.missing.length > 0 || pairing.extra.length > 0) {
    const count = pairing.pairs.length + pairing.extra.length;
    return {
      error: `${formula.discipline.toLowerCase()} template has ${count} sessions; formula has ${formula.sessions.length}`,
    };
  }
  return applyCatalogPairing(items, pairing);
}

export function mixItemsForTemplate(
  templateId: string | null | undefined,
  templates:
    | Array<{ id: string; items?: FormulaTemplateItem[] | null }>
    | undefined
): FormulaTemplateItem[] | undefined {
  if (!templateId || !templates) return undefined;
  return templates.find((row) => row.id === templateId)?.items ?? undefined;
}

export function formulaMixPreview(
  items: FormulaTemplateItem[],
  discipline: FormulaDiscipline,
  hours: number | null
): string {
  if (!templateDisciplineHasMix(items, discipline)) {
    return "No mix on this template";
  }
  if (hours == null || !Number.isFinite(hours) || hours <= 0) {
    const count = items.filter((item) => item.discipline === discipline).length;
    return `${count} ${discipline.toLowerCase()} sessions. Set start hours to preview.`;
  }
  const resolved = resolveTemplateFormulaWeek(items, { [discipline]: hours });
  const labels = items
    .map((item, index) =>
      item.discipline === discipline ? resolved[index]?.label : null
    )
    .filter((label): label is string => Boolean(label));
  return labels.join(", ");
}
