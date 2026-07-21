import type {
  Discipline,
  SignalType,
  SignalPreference,
  SessionRole,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SESSION_ROLES } from "@/lib/plan/session-role";
import { DEFAULT_DISCIPLINE_SIGNALS } from "@/lib/zones/defaults";

/** Sparse role → signal map. Unset roles inherit the discipline primary. */
export type RoleSignalOverrides = Partial<Record<SessionRole, SignalType>>;

export type SignalPreferenceSnapshot = {
  primarySignal: SignalType;
  fallbackSignal: SignalType | null;
  roleSignals: RoleSignalOverrides;
};

const BIKE_PRIMARY: SignalType[] = ["POWER", "HEART_RATE"];
const RUN_PRIMARY: SignalType[] = ["PACE", "HEART_RATE"];

export function allowedPrimarySignals(discipline: Discipline): SignalType[] {
  if (discipline === "BIKE") return BIKE_PRIMARY;
  if (discipline === "RUN") return RUN_PRIMARY;
  if (discipline === "SWIM") return ["PACE"];
  return ["HEART_RATE"];
}

export function deriveFallbackSignal(
  discipline: Discipline,
  primarySignal: SignalType
): SignalType | null {
  if (discipline === "SWIM") return null;
  if (discipline === "BIKE") {
    return primarySignal === "POWER" ? "HEART_RATE" : "POWER";
  }
  if (discipline === "RUN") {
    return primarySignal === "PACE" ? "HEART_RATE" : "PACE";
  }
  return null;
}

export function validatePrimarySignal(
  discipline: Discipline,
  primarySignal: SignalType
): void {
  if (!allowedPrimarySignals(discipline).includes(primarySignal)) {
    throw new Error(`Invalid primary signal ${primarySignal} for ${discipline}`);
  }
}

export function parseRoleSignals(raw: unknown): RoleSignalOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const allowedRoles = new Set<string>(SESSION_ROLES);
  const result: RoleSignalOverrides = {};
  for (const [role, signal] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowedRoles.has(role)) continue;
    if (signal !== "POWER" && signal !== "HEART_RATE" && signal !== "PACE") continue;
    result[role as SessionRole] = signal;
  }
  return result;
}

export function validateRoleSignals(
  discipline: Discipline,
  roleSignals: RoleSignalOverrides
): void {
  const allowed = new Set(allowedPrimarySignals(discipline));
  for (const [role, signal] of Object.entries(roleSignals)) {
    if (!SESSION_ROLES.includes(role as SessionRole)) {
      throw new Error(`Invalid session role ${role}`);
    }
    if (!signal || !allowed.has(signal)) {
      throw new Error(`Invalid role signal ${signal} for ${discipline} ${role}`);
    }
  }
}

/** Drop overrides that equal the discipline primary (sparse storage). */
export function normalizeRoleSignals(
  primarySignal: SignalType,
  roleSignals: RoleSignalOverrides
): RoleSignalOverrides {
  const result: RoleSignalOverrides = {};
  for (const role of SESSION_ROLES) {
    const signal = roleSignals[role];
    if (signal != null && signal !== primarySignal) {
      result[role] = signal;
    }
  }
  return result;
}

export function roleSignalsEqual(
  a: RoleSignalOverrides,
  b: RoleSignalOverrides
): boolean {
  for (const role of SESSION_ROLES) {
    if ((a[role] ?? null) !== (b[role] ?? null)) return false;
  }
  return true;
}

export function preferenceSnapshot(
  discipline: Discipline,
  primarySignal: SignalType,
  roleSignals: RoleSignalOverrides = {}
): SignalPreferenceSnapshot {
  validatePrimarySignal(discipline, primarySignal);
  const normalized = normalizeRoleSignals(primarySignal, roleSignals);
  validateRoleSignals(discipline, normalized);
  return {
    primarySignal,
    fallbackSignal: deriveFallbackSignal(discipline, primarySignal),
    roleSignals: normalized,
  };
}

/**
 * Resolve the effective primary/fallback for a session role.
 * Unset roles inherit the discipline primary; fallback is always the other signal.
 */
export function resolveSignalForRole(
  discipline: Discipline,
  snapshot: SignalPreferenceSnapshot,
  sessionRole: SessionRole | null | undefined
): Pick<SignalPreferenceSnapshot, "primarySignal" | "fallbackSignal"> {
  const override =
    sessionRole != null ? snapshot.roleSignals[sessionRole] : undefined;
  const primary = override ?? snapshot.primarySignal;
  return {
    primarySignal: primary,
    fallbackSignal: deriveFallbackSignal(discipline, primary),
  };
}

export type ResolveSessionSignalInput = {
  sessionRole?: SessionRole | null;
  /** Per-session override; beats role override when set and valid for discipline. */
  tizSignalOverride?: SignalType | null;
};

/**
 * Resolution order: session override → role override → discipline primary.
 * Fallback is always the paired alternate signal for the resolved primary.
 */
export function resolveSignalForSession(
  discipline: Discipline,
  snapshot: SignalPreferenceSnapshot,
  input: ResolveSessionSignalInput = {}
): Pick<SignalPreferenceSnapshot, "primarySignal" | "fallbackSignal"> {
  const override = input.tizSignalOverride ?? null;
  if (override != null && allowedPrimarySignals(discipline).includes(override)) {
    return {
      primarySignal: override,
      fallbackSignal: deriveFallbackSignal(discipline, override),
    };
  }
  return resolveSignalForRole(discipline, snapshot, input.sessionRole);
}

/** Convenience for prescription UI: effective primary SignalType for a session. */
export function resolvePrimarySignalForSession(
  discipline: Discipline,
  snapshot: SignalPreferenceSnapshot,
  sessionRole: SessionRole | null | undefined,
  tizSignalOverride?: SignalType | null
): SignalType {
  return resolveSignalForSession(discipline, snapshot, {
    sessionRole,
    tizSignalOverride,
  }).primarySignal;
}

export function signalTypeToTargetView(
  signal: SignalType
): "zone" | "pace_power" | "heart_rate" {
  if (signal === "HEART_RATE") return "heart_rate";
  return "pace_power";
}

export function signalTypeToTargetSignal(signal: SignalType): "power" | "pace" | "heart_rate" {
  if (signal === "POWER") return "power";
  if (signal === "HEART_RATE") return "heart_rate";
  return "pace";
}

function snapshotFromRow(row: {
  primarySignal: SignalType;
  fallbackSignal: SignalType | null;
  roleSignals?: unknown;
}): SignalPreferenceSnapshot {
  return {
    primarySignal: row.primarySignal,
    fallbackSignal: row.fallbackSignal,
    roleSignals: parseRoleSignals(roleSignalsField(row)),
  };
}

function roleSignalsField(row: { roleSignals?: unknown }): unknown {
  return "roleSignals" in row ? row.roleSignals : null;
}

function roleSignalsJson(
  roleSignals: RoleSignalOverrides
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (Object.keys(roleSignals).length === 0) return Prisma.JsonNull;
  return roleSignals as Prisma.InputJsonValue;
}

const SIGNAL_PREFERENCE_CORE_SELECT = {
  id: true,
  athleteId: true,
  discipline: true,
  primarySignal: true,
  fallbackSignal: true,
  effectiveDate: true,
  createdAt: true,
} as const;

async function findSignalPreferenceAtDate(
  athleteId: string,
  discipline: Discipline,
  activityDate: Date
) {
  try {
    return await db.signalPreference.findFirst({
      where: {
        athleteId,
        discipline,
        effectiveDate: { lte: activityDate },
      },
      orderBy: { effectiveDate: "desc" },
    });
  } catch (error) {
    if (!isMissingRoleSignalsColumn(error)) throw error;
    return db.signalPreference.findFirst({
      where: {
        athleteId,
        discipline,
        effectiveDate: { lte: activityDate },
      },
      orderBy: { effectiveDate: "desc" },
      select: SIGNAL_PREFERENCE_CORE_SELECT,
    });
  }
}

export async function getSignalPreferenceAtDate(
  athleteId: string,
  discipline: Discipline,
  activityDate: Date
): Promise<SignalPreferenceSnapshot | null> {
  const row = await findSignalPreferenceAtDate(athleteId, discipline, activityDate);
  if (!row) return null;
  return snapshotFromRow(row);
}

export async function getPreferenceDateRange(
  preference: Pick<SignalPreference, "athleteId" | "discipline" | "effectiveDate">
): Promise<{ from: Date; to: Date | null }> {
  const next = await db.signalPreference.findFirst({
    where: {
      athleteId: preference.athleteId,
      discipline: preference.discipline,
      effectiveDate: { gt: preference.effectiveDate },
    },
    orderBy: { effectiveDate: "asc" },
    select: { effectiveDate: true },
  });
  return {
    from: preference.effectiveDate,
    to: next?.effectiveDate ?? null,
  };
}

function isMissingRoleSignalsColumn(error: unknown): boolean {
  return (
    error instanceof Error &&
    /roleSignals|column .* does not exist|Unknown arg `roleSignals`/i.test(error.message)
  );
}

export async function listSignalPreferences(athleteId: string) {
  try {
    return await db.signalPreference.findMany({
      where: { athleteId },
      orderBy: { effectiveDate: "desc" },
    });
  } catch (error) {
    if (!isMissingRoleSignalsColumn(error)) throw error;
    return db.signalPreference.findMany({
      where: { athleteId },
      orderBy: { effectiveDate: "desc" },
      select: SIGNAL_PREFERENCE_CORE_SELECT,
    });
  }
}

const DISCIPLINE_SETTINGS_CORE_SELECT = {
  id: true,
  athleteId: true,
  discipline: true,
  primarySignal: true,
  fallbackSignal: true,
  displayUnit: true,
  poolSize: true,
  pastWorkoutShading: true,
} as const;

export async function listDisciplineSettings(athleteId: string) {
  try {
    return await db.athleteDisciplineSettings.findMany({ where: { athleteId } });
  } catch (error) {
    if (!isMissingRoleSignalsColumn(error)) throw error;
    return db.athleteDisciplineSettings.findMany({
      where: { athleteId },
      select: DISCIPLINE_SETTINGS_CORE_SELECT,
    });
  }
}

export async function syncCurrentPreferenceToSettings(
  athleteId: string,
  discipline: Discipline
): Promise<void> {
  let latest: {
    primarySignal: SignalType;
    fallbackSignal: SignalType | null;
    roleSignals?: unknown;
  } | null;
  try {
    latest = await db.signalPreference.findFirst({
      where: { athleteId, discipline },
      orderBy: { effectiveDate: "desc" },
    });
  } catch (error) {
    if (!isMissingRoleSignalsColumn(error)) throw error;
    latest = await db.signalPreference.findFirst({
      where: { athleteId, discipline },
      orderBy: { effectiveDate: "desc" },
      select: SIGNAL_PREFERENCE_CORE_SELECT,
    });
  }
  if (!latest) return;
  const base = {
    primarySignal: latest.primarySignal,
    fallbackSignal: latest.fallbackSignal,
  };
  try {
    await db.athleteDisciplineSettings.update({
      where: { athleteId_discipline: { athleteId, discipline } },
      data: {
        ...base,
        roleSignals: roleSignalsJson(parseRoleSignals(roleSignalsField(latest))),
      },
    });
  } catch (error) {
    if (!isMissingRoleSignalsColumn(error)) throw error;
    await db.athleteDisciplineSettings.update({
      where: { athleteId_discipline: { athleteId, discipline } },
      data: base,
    });
  }
}

export type UpsertSignalPreferenceInput = {
  primarySignal: SignalType;
  effectiveDate: Date;
  /**
   * Role overrides to store. `undefined` keeps existing overrides for that
   * effective date (or copies from the previous preference on create).
   * Pass `{}` to clear all overrides.
   */
  roleSignals?: RoleSignalOverrides;
};

export async function upsertSignalPreference(
  athleteId: string,
  discipline: Discipline,
  primarySignal: SignalType,
  effectiveDate: Date,
  roleSignals?: RoleSignalOverrides
): Promise<SignalPreference> {
  let existing: {
    primarySignal: SignalType;
    fallbackSignal: SignalType | null;
    roleSignals?: unknown;
  } | null;
  try {
    existing = await db.signalPreference.findUnique({
      where: {
        athleteId_discipline_effectiveDate: {
          athleteId,
          discipline,
          effectiveDate,
        },
      },
    });
  } catch (error) {
    if (!isMissingRoleSignalsColumn(error)) throw error;
    existing = await db.signalPreference.findUnique({
      where: {
        athleteId_discipline_effectiveDate: {
          athleteId,
          discipline,
          effectiveDate,
        },
      },
      select: SIGNAL_PREFERENCE_CORE_SELECT,
    });
  }

  let resolvedRoles: RoleSignalOverrides;
  if (roleSignals !== undefined) {
    resolvedRoles = roleSignals;
  } else if (existing) {
    resolvedRoles = parseRoleSignals(roleSignalsField(existing));
  } else {
    let previous: {
      primarySignal: SignalType;
      fallbackSignal: SignalType | null;
      roleSignals?: unknown;
    } | null;
    try {
      previous = await db.signalPreference.findFirst({
        where: {
          athleteId,
          discipline,
          effectiveDate: { lt: effectiveDate },
        },
        orderBy: { effectiveDate: "desc" },
      });
    } catch (error) {
      if (!isMissingRoleSignalsColumn(error)) throw error;
      previous = await db.signalPreference.findFirst({
        where: {
          athleteId,
          discipline,
          effectiveDate: { lt: effectiveDate },
        },
        orderBy: { effectiveDate: "desc" },
        select: SIGNAL_PREFERENCE_CORE_SELECT,
      });
    }
    resolvedRoles = previous ? parseRoleSignals(roleSignalsField(previous)) : {};
  }

  const snapshot = preferenceSnapshot(discipline, primarySignal, resolvedRoles);
  const where = {
    athleteId_discipline_effectiveDate: {
      athleteId,
      discipline,
      effectiveDate,
    },
  };
  const baseCreate = {
    athleteId,
    discipline,
    primarySignal: snapshot.primarySignal,
    fallbackSignal: snapshot.fallbackSignal,
    effectiveDate,
  };
  const baseUpdate = {
    primarySignal: snapshot.primarySignal,
    fallbackSignal: snapshot.fallbackSignal,
  };
  const roleJson = roleSignalsJson(snapshot.roleSignals);
  // Explicit roleUpdates always write roleSignals. Primary-only updates on an
  // existing row omit the column (works pre-migration). New dated rows still
  // try to copy prior overrides when available.
  const writeRolesOnCreate =
    roleSignals !== undefined || Object.keys(snapshot.roleSignals).length > 0;
  const writeRolesOnUpdate = roleSignals !== undefined;

  async function upsertWithOptionalRoles(includeRoles: boolean) {
    return db.signalPreference.upsert({
      where,
      create: includeRoles ? { ...baseCreate, roleSignals: roleJson } : baseCreate,
      update: writeRolesOnUpdate
        ? { ...baseUpdate, roleSignals: roleJson }
        : baseUpdate,
    });
  }

  let row: SignalPreference;
  try {
    row = await upsertWithOptionalRoles(writeRolesOnCreate);
  } catch (error) {
    if (!writeRolesOnCreate || !isMissingRoleSignalsColumn(error)) throw error;
    row = await upsertWithOptionalRoles(false);
  }
  await syncCurrentPreferenceToSettings(athleteId, discipline);
  return row;
}

export async function resolveSignalSettingsForDate(
  athleteId: string,
  discipline: Discipline,
  activityDate: Date,
  staticSettings: SignalPreferenceSnapshot | null
): Promise<SignalPreferenceSnapshot> {
  const dated = await getSignalPreferenceAtDate(athleteId, discipline, activityDate);
  if (dated) return dated;
  if (staticSettings) {
    return {
      primarySignal: staticSettings.primarySignal,
      fallbackSignal: staticSettings.fallbackSignal,
      roleSignals: staticSettings.roleSignals ?? {},
    };
  }
  const defaults = DEFAULT_DISCIPLINE_SIGNALS[discipline];
  return {
    primarySignal: defaults.primary,
    fallbackSignal: defaults.fallback,
    roleSignals: {},
  };
}

/** Human-readable summary of role overrides for settings UI. */
export function formatRoleSignalSummary(
  primarySignal: SignalType,
  roleSignals: RoleSignalOverrides,
  signalLabelFn: (s: SignalType) => string
): string | null {
  const parts: string[] = [];
  for (const role of SESSION_ROLES) {
    const signal = roleSignals[role];
    if (signal != null && signal !== primarySignal) {
      const label =
        role === "EASY"
          ? "Easy"
          : role === "MODERATE"
            ? "Moderate"
            : role === "INTENSITY"
              ? "Intensity"
              : "Long";
      parts.push(`${label} ${signalLabelFn(signal)}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
