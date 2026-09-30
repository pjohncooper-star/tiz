import { weeklyCompoundVolumeAtWeek, roundHours } from "./volume-ramp-triad";

export const FORMULA_DISCIPLINES = ["SWIM", "BIKE", "RUN"] as const;

export type FormulaDiscipline = (typeof FORMULA_DISCIPLINES)[number];

export type FormulaZone = 1 | 2 | 3 | 4 | 5;

export type FormulaSession = {
  sharePercent: number;
  zone: FormulaZone;
  intensity: boolean;
  long: boolean;
};

export type DisciplineFormula = {
  id: string;
  name: string;
  discipline: FormulaDiscipline;
  sessions: FormulaSession[];
};

export type SessionFormulaCatalog = DisciplineFormula[];

export type DisciplineFormulaIds = {
  SWIM: string | null;
  BIKE: string | null;
  RUN: string | null;
};

export type FormulaWeekSession = FormulaSession & {
  minutes: number;
};

export type FormulaWeekResult = {
  hours: number;
  zoneMinutes: Record<FormulaZone, number>;
  sessionCount: number;
  intenseCount: number;
  longMinutes: number;
  sessions: FormulaWeekSession[];
};

export function emptyDisciplineFormulaIds(): DisciplineFormulaIds {
  return { SWIM: null, BIKE: null, RUN: null };
}

export function formulaIdsAreEmpty(ids: DisciplineFormulaIds | null | undefined): boolean {
  if (!ids) return true;
  return !ids.SWIM && !ids.BIKE && !ids.RUN;
}

export function newSessionFormulaId(): string {
  return `sf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultFormulaSession(): FormulaSession {
  return { sharePercent: 100, zone: 1, intensity: false, long: false };
}

export function createEmptyDisciplineFormula(
  discipline: FormulaDiscipline = "RUN"
): DisciplineFormula {
  return {
    id: newSessionFormulaId(),
    name: "",
    discipline,
    sessions: [defaultFormulaSession()],
  };
}

function isFormulaDiscipline(value: unknown): value is FormulaDiscipline {
  return value === "SWIM" || value === "BIKE" || value === "RUN";
}

function isFormulaZone(value: unknown): value is FormulaZone {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function formulaShareTotal(sessions: FormulaSession[]): number {
  return sessions.reduce((sum, session) => sum + session.sharePercent, 0);
}

export function validateDisciplineFormula(formula: DisciplineFormula): string | null {
  if (!formula.name.trim()) return "Name the formula";
  if (!isFormulaDiscipline(formula.discipline)) return "Choose a sport";
  if (formula.sessions.length < 1) return "Add at least one session";
  if (formula.sessions.length > 7) return "A formula can have at most 7 sessions";
  const longCount = formula.sessions.filter((session) => session.long).length;
  if (longCount > 1) return "Mark at most one long session";
  if (formula.discipline === "SWIM" && longCount > 0) {
    return "Swim formulas do not have a long session";
  }
  for (const session of formula.sessions) {
    if (!Number.isFinite(session.sharePercent) || session.sharePercent <= 0) {
      return "Each session needs a share above 0";
    }
    if (!isFormulaZone(session.zone)) return "Each session needs a zone";
  }
  const total = formulaShareTotal(formula.sessions);
  if (Math.abs(total - 100) > 0.05) return "Session shares must total 100%";
  return null;
}

function parseSession(raw: unknown, discipline: FormulaDiscipline): FormulaSession | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const sharePercent = Number(row.sharePercent);
  const zone = Number(row.zone);
  if (!Number.isFinite(sharePercent) || sharePercent <= 0) return null;
  if (!isFormulaZone(zone)) return null;
  const long = discipline !== "SWIM" && row.long === true;
  return {
    sharePercent,
    zone,
    intensity: row.intensity === true,
    long,
  };
}

function parseFormula(raw: unknown): DisciplineFormula | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!id || !name || !isFormulaDiscipline(row.discipline)) return null;
  if (!Array.isArray(row.sessions)) return null;
  const sessions = row.sessions
    .map((session) => parseSession(session, row.discipline as FormulaDiscipline))
    .filter((session): session is FormulaSession => session != null);
  const formula: DisciplineFormula = {
    id,
    name,
    discipline: row.discipline,
    sessions,
  };
  if (validateDisciplineFormula(formula)) return null;
  return formula;
}

export function parseSessionFormulaCatalog(raw: unknown): SessionFormulaCatalog {
  if (!Array.isArray(raw)) return [];
  const parsed: DisciplineFormula[] = [];
  for (const item of raw) {
    const formula = parseFormula(item);
    if (formula) parsed.push(formula);
  }
  return parsed;
}

export function serializeSessionFormulaCatalog(
  catalog: SessionFormulaCatalog
): DisciplineFormula[] {
  return catalog
    .filter((formula) => validateDisciplineFormula(formula) == null)
    .map((formula) => ({
      id: formula.id,
      name: formula.name.trim(),
      discipline: formula.discipline,
      sessions: formula.sessions.map((session) => ({
        sharePercent: session.sharePercent,
        zone: session.zone,
        intensity: session.intensity,
        long: formula.discipline !== "SWIM" && session.long,
      })),
    }));
}

export function parseDisciplineFormulaIds(raw: unknown): DisciplineFormulaIds {
  const ids = emptyDisciplineFormulaIds();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ids;
  const row = raw as Record<string, unknown>;
  for (const discipline of FORMULA_DISCIPLINES) {
    const value = row[discipline];
    ids[discipline] = typeof value === "string" && value.trim() ? value.trim() : null;
  }
  return ids;
}

export function resolveDisciplineFormula(
  catalog: SessionFormulaCatalog,
  id: string | null | undefined
): DisciplineFormula | null {
  if (!id) return null;
  return catalog.find((formula) => formula.id === id) ?? null;
}

export function formulaForDiscipline(
  catalog: SessionFormulaCatalog,
  ids: DisciplineFormulaIds | null | undefined,
  discipline: FormulaDiscipline
): DisciplineFormula | null {
  const formula = resolveDisciplineFormula(catalog, ids?.[discipline]);
  if (!formula || formula.discipline !== discipline) return null;
  return formula;
}

/**
 * Compound growth from the phase start at the season's rate for the sport, capped at
 * the season's peak for the sport. Rest weeks are not an offset. A peak of 0 or less
 * means no cap.
 */
export function formulaHoursAtTrainingWeek(input: {
  startHours: number;
  ratePercent: number;
  peakHours: number;
  trainingWeekOffset: number;
}): number {
  const start = Math.max(0, input.startHours);
  const rate = Number.isFinite(input.ratePercent) ? Math.max(0, input.ratePercent) : 0;
  const grown = weeklyCompoundVolumeAtWeek(
    start,
    rate,
    Math.max(0, input.trainingWeekOffset),
    "INCREASE"
  );
  if (!Number.isFinite(input.peakHours) || input.peakHours <= 0) return grown;
  return roundHours(Math.min(grown, input.peakHours));
}

export type FormulaGrowthSource = "phase" | "season" | "none";

export function formulaGrowthSummary(input: {
  ratePercent: number;
  peakHours: number;
  peakSource: FormulaGrowthSource;
}): string {
  const growth =
    input.ratePercent > 0
      ? `Grows ${input.ratePercent}% per week (phase)`
      : "Holds weekly hours";
  const peak =
    input.peakSource === "none" || !(input.peakHours > 0)
      ? ""
      : `, peak ${roundHours(input.peakHours)} h (${input.peakSource})`;
  return `${growth}${peak}.`;
}

export function distributeMinutes(totalMinutes: number, shares: number[]): number[] {
  if (shares.length === 0) return [];
  const raw = shares.map((share) => (share / 100) * totalMinutes);
  const minutes = raw.map((value) => Math.floor(value));
  let remainder = totalMinutes - minutes.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    minutes[order[cursor % order.length]!.index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return minutes;
}

export function formulaWeekFromHours(
  formula: DisciplineFormula,
  hours: number
): FormulaWeekResult {
  const totalMinutes = Math.max(0, Math.round(Math.max(0, hours) * 60));
  const minutes = distributeMinutes(
    totalMinutes,
    formula.sessions.map((session) => session.sharePercent)
  );
  const zoneMinutes: Record<FormulaZone, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const sessions: FormulaWeekSession[] = formula.sessions.map((session, index) => {
    const sessionMinutes = minutes[index] ?? 0;
    zoneMinutes[session.zone] += sessionMinutes;
    return { ...session, minutes: sessionMinutes };
  });
  const longSession = sessions.find((session) => session.long);
  return {
    hours: roundHours(hours),
    zoneMinutes,
    sessionCount: sessions.length,
    intenseCount: sessions.filter((session) => session.intensity && !session.long).length,
    longMinutes: longSession?.minutes ?? 0,
    sessions,
  };
}

export function formulaHasLong(formula: DisciplineFormula): boolean {
  return formula.sessions.some((session) => session.long);
}

export function formulaSessionSummary(
  formula: DisciplineFormula,
  startHours: number | null
): string {
  if (startHours == null || !Number.isFinite(startHours)) {
    return `${formula.sessions.length} ${formula.sessions.length === 1 ? "session" : "sessions"}. Set start hours to see minutes.`;
  }
  const week = formulaWeekFromHours(formula, startHours);
  const shares = week.sessions
    .map((session) => {
      const tags = [
        session.intensity ? "intensity" : null,
        session.long ? "long" : null,
      ].filter((tag): tag is string => Boolean(tag));
      const tag = tags.length > 0 ? ` (${tags.join(", ")})` : "";
      return `${session.minutes} min Z${session.zone}${tag}`;
    })
    .join(", ");
  return `At the start hours: ${shares}.`;
}

export function formulaLongSummary(
  formula: DisciplineFormula,
  startHours: number | null
): string {
  if (!formulaHasLong(formula)) return "No long session.";
  if (startHours == null || !Number.isFinite(startHours)) {
    return "Long minutes follow the session marked long.";
  }
  return `${formulaWeekFromHours(formula, startHours).longMinutes} min at the start hours.`;
}
