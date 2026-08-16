import type { Discipline } from "@prisma/client";

export const PROGRAM_DISCIPLINES = ["SWIM", "BIKE", "RUN", "STRENGTH"] as const;
export type ProgramDiscipline = (typeof PROGRAM_DISCIPLINES)[number];

export type PlanSessionConflict = {
  losingAttachmentId: string;
  dayOffset: number;
  sortOrder: number;
  resolution: "drop" | "keep";
};

export type ClashSessionRef = {
  attachmentId: string;
  attachmentName: string;
  dayOffset: number;
  sortOrder: number;
  title?: string;
};

export type PlanSessionClash = {
  dateKey: string;
  discipline: ProgramDiscipline;
  a: ClashSessionRef;
  b: ClashSessionRef;
};

export type ScheduledClashSession = {
  attachmentId: string;
  attachmentName?: string;
  scheduledDateKey: string;
  discipline: Discipline | string;
  dayOffset: number;
  sortOrder: number;
  title?: string;
};

function isProgramDiscipline(value: string): value is ProgramDiscipline {
  return (PROGRAM_DISCIPLINES as readonly string[]).includes(value);
}

export function parsePlanSessionConflicts(raw: unknown): PlanSessionConflict[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanSessionConflict[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const losingAttachmentId =
      typeof rec.losingAttachmentId === "string" ? rec.losingAttachmentId : "";
    const dayOffset = Number(rec.dayOffset);
    const sortOrder = Number(rec.sortOrder);
    const resolution = rec.resolution === "drop" ? "drop" : rec.resolution === "keep" ? "keep" : null;
    if (!losingAttachmentId || !Number.isInteger(dayOffset) || dayOffset < 0) continue;
    if (!Number.isInteger(sortOrder) || sortOrder < 0) continue;
    if (!resolution) continue;
    out.push({ losingAttachmentId, dayOffset, sortOrder, resolution });
  }
  return out;
}

export function parseOwnsDisciplines(raw: unknown): ProgramDiscipline[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: ProgramDiscipline[] = [];
  for (const value of raw) {
    if (typeof value === "string" && isProgramDiscipline(value) && !out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}

export function parseFillLeftoverTiz(
  raw: unknown
): Partial<Record<ProgramDiscipline, boolean>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const rec = raw as Record<string, unknown>;
  const out: Partial<Record<ProgramDiscipline, boolean>> = {};
  for (const discipline of PROGRAM_DISCIPLINES) {
    if (typeof rec[discipline] === "boolean") out[discipline] = rec[discipline];
  }
  return out;
}

export function conflictKey(
  attachmentId: string,
  dayOffset: number,
  sortOrder: number
): string {
  return `${attachmentId}:${dayOffset}:${sortOrder}`;
}

export function isDroppedPlanSession(
  conflicts: PlanSessionConflict[],
  attachmentId: string,
  dayOffset: number,
  sortOrder: number
): boolean {
  return conflicts.some(
    (row) =>
      row.resolution === "drop" &&
      row.losingAttachmentId === attachmentId &&
      row.dayOffset === dayOffset &&
      row.sortOrder === sortOrder
  );
}

export function filterDroppedPlanSessions<T extends {
  attachmentId?: string;
  dayOffset?: number;
  sortOrder?: number;
}>(sessions: T[], conflicts: PlanSessionConflict[]): T[] {
  if (conflicts.length === 0) return sessions;
  return sessions.filter((session) => {
    if (
      session.attachmentId == null ||
      session.dayOffset == null ||
      session.sortOrder == null
    ) {
      return true;
    }
    return !isDroppedPlanSession(
      conflicts,
      session.attachmentId,
      session.dayOffset,
      session.sortOrder
    );
  });
}

export function detectPlanSessionClashes(
  sessions: ScheduledClashSession[]
): PlanSessionClash[] {
  const groups = new Map<string, ScheduledClashSession[]>();
  for (const session of sessions) {
    if (!isProgramDiscipline(session.discipline)) continue;
    const key = `${session.scheduledDateKey}:${session.discipline}`;
    const list = groups.get(key) ?? [];
    list.push(session);
    groups.set(key, list);
  }

  const clashes: PlanSessionClash[] = [];
  for (const list of groups.values()) {
    const byAttachment = new Map<string, ScheduledClashSession>();
    for (const session of list) {
      if (!byAttachment.has(session.attachmentId)) {
        byAttachment.set(session.attachmentId, session);
      }
    }
    if (byAttachment.size < 2) continue;
    const unique = [...byAttachment.values()].sort((a, b) =>
      a.attachmentId.localeCompare(b.attachmentId)
    );
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i]!;
        const b = unique[j]!;
        clashes.push({
          dateKey: a.scheduledDateKey,
          discipline: a.discipline as ProgramDiscipline,
          a: {
            attachmentId: a.attachmentId,
            attachmentName: a.attachmentName ?? a.attachmentId,
            dayOffset: a.dayOffset,
            sortOrder: a.sortOrder,
            title: a.title,
          },
          b: {
            attachmentId: b.attachmentId,
            attachmentName: b.attachmentName ?? b.attachmentId,
            dayOffset: b.dayOffset,
            sortOrder: b.sortOrder,
            title: b.title,
          },
        });
      }
    }
  }
  return clashes.sort((left, right) =>
    left.dateKey === right.dateKey
      ? left.discipline.localeCompare(right.discipline)
      : left.dateKey.localeCompare(right.dateKey)
  );
}

function clashSideRecorded(
  clash: PlanSessionClash,
  side: "a" | "b",
  conflicts: PlanSessionConflict[]
): boolean {
  const ref = clash[side];
  return conflicts.some(
    (row) =>
      row.losingAttachmentId === ref.attachmentId &&
      row.dayOffset === ref.dayOffset &&
      row.sortOrder === ref.sortOrder
  );
}

export function clashIsUnresolved(
  clash: PlanSessionClash,
  conflicts: PlanSessionConflict[]
): boolean {
  return !(clashSideRecorded(clash, "a", conflicts) && clashSideRecorded(clash, "b", conflicts));
}

export function upsertConflict(
  conflicts: PlanSessionConflict[],
  next: PlanSessionConflict
): PlanSessionConflict[] {
  const without = conflicts.filter(
    (row) =>
      !(
        row.losingAttachmentId === next.losingAttachmentId &&
        row.dayOffset === next.dayOffset &&
        row.sortOrder === next.sortOrder
      )
  );
  return [...without, next];
}

export function resolveClashPrefer(
  clash: PlanSessionClash,
  prefer: "a" | "b" | "both",
  conflicts: PlanSessionConflict[]
): PlanSessionConflict[] {
  let next = conflicts;
  if (prefer === "both") {
    next = upsertConflict(next, {
      losingAttachmentId: clash.a.attachmentId,
      dayOffset: clash.a.dayOffset,
      sortOrder: clash.a.sortOrder,
      resolution: "keep",
    });
    next = upsertConflict(next, {
      losingAttachmentId: clash.b.attachmentId,
      dayOffset: clash.b.dayOffset,
      sortOrder: clash.b.sortOrder,
      resolution: "keep",
    });
    return next;
  }
  const drop = prefer === "a" ? clash.b : clash.a;
  const keep = prefer === "a" ? clash.a : clash.b;
  next = upsertConflict(next, {
    losingAttachmentId: keep.attachmentId,
    dayOffset: keep.dayOffset,
    sortOrder: keep.sortOrder,
    resolution: "keep",
  });
  next = upsertConflict(next, {
    losingAttachmentId: drop.attachmentId,
    dayOffset: drop.dayOffset,
    sortOrder: drop.sortOrder,
    resolution: "drop",
  });
  return next;
}
