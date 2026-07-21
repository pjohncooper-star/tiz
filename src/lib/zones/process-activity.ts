import { db } from "@/lib/db";
import {
  computeZoneBreakdown,
  isStreamUsable,
  type NormalizedStreams,
  resolveCanonicalSignal,
} from "@/lib/zones/compute";
import { normalizeStreamsForZones } from "@/lib/zones/normalize-streams";
import {
  parseRoleSignals,
  resolveSignalForSession,
  resolveSignalSettingsForDate,
} from "@/lib/zones/signal-preference";
import { getThresholdProfileAtDate } from "@/lib/zones/thresholds";
import { computeSessionEcos, ecoTransitionBump } from "@/lib/eco/compute";
import {
  inferSessionRole,
  resolveDisplaySessionRole,
} from "@/lib/plan/session-role";
import { inferSignalFromWorkoutNodes } from "@/lib/workout/infer-prescription-signal";
import { parseWorkoutTree } from "@/lib/workout/workout-tree";
import { Prisma, type ActivityLegType, type SessionRole, type SignalType } from "@prisma/client";

export function parseStoredStreams(raw: unknown): NormalizedStreams {
  if (!raw || typeof raw !== "object") return {};
  return raw as NormalizedStreams;
}

async function priorLegTypesForActivity(input: {
  athleteId: string;
  multisportGroupId: string | null;
  sessionIndex: number | null;
  startTime: Date;
}): Promise<ActivityLegType[]> {
  if (!input.multisportGroupId) return [];
  const siblings = await db.syncedActivity.findMany({
    where: {
      athleteId: input.athleteId,
      multisportGroupId: input.multisportGroupId,
      OR: [
        ...(input.sessionIndex != null
          ? [{ sessionIndex: { lt: input.sessionIndex } }]
          : []),
        {
          sessionIndex: input.sessionIndex,
          startTime: { lt: input.startTime },
        },
        ...(input.sessionIndex == null
          ? [{ startTime: { lt: input.startTime } }]
          : []),
      ],
    },
    select: { legType: true, sessionIndex: true, startTime: true },
    orderBy: [{ sessionIndex: "asc" }, { startTime: "asc" }],
  });

  return siblings
    .map((s) => s.legType)
    .filter((t): t is ActivityLegType => t != null && t !== "TRANSITION");
}

function ecoClearUpdate() {
  return {
    ecos: null as number | null,
    ecoZoneMinutes: Prisma.JsonNull,
    ecoComputed: true,
  };
}

type LinkedSessionContext = {
  sessionRole: SessionRole;
  tizSignalOverride: SignalType | null;
  title: string;
  discipline: import("@prisma/client").Discipline;
  estimatedDurationMinutes: number | null;
  targetZones: unknown;
  structuredSteps: unknown | null;
};

async function loadLinkedSessionContext(
  activityId: string,
  athleteId: string
): Promise<LinkedSessionContext | null> {
  try {
    return await db.plannedSession.findFirst({
      where: { linkedActivityId: activityId, athleteId },
      select: {
        sessionRole: true,
        tizSignalOverride: true,
        title: true,
        discipline: true,
        estimatedDurationMinutes: true,
        targetZones: true,
        structuredWorkout: { select: { steps: true } },
      },
    }).then((row) =>
      row
        ? {
            sessionRole: row.sessionRole,
            tizSignalOverride: row.tizSignalOverride,
            title: row.title,
            discipline: row.discipline,
            estimatedDurationMinutes: row.estimatedDurationMinutes,
            targetZones: row.targetZones,
            structuredSteps: row.structuredWorkout?.steps ?? null,
          }
        : null
    );
  } catch (error) {
    // Pre-migration: column may not exist yet.
    if (
      error instanceof Error &&
      /tizSignalOverride|column .* does not exist/i.test(error.message)
    ) {
      const row = await db.plannedSession.findFirst({
        where: { linkedActivityId: activityId, athleteId },
        select: {
          sessionRole: true,
          title: true,
          discipline: true,
          estimatedDurationMinutes: true,
          targetZones: true,
          structuredWorkout: { select: { steps: true } },
        },
      });
      return row
        ? {
            sessionRole: row.sessionRole,
            tizSignalOverride: null,
            title: row.title,
            discipline: row.discipline,
            estimatedDurationMinutes: row.estimatedDurationMinutes,
            targetZones: row.targetZones,
            structuredSteps: row.structuredWorkout?.steps ?? null,
          }
        : null;
    }
    throw error;
  }
}

async function resolveSessionContextForActivity(
  activity: {
    id: string;
    athleteId: string;
    name: string;
    discipline: import("@prisma/client").Discipline;
    durationSeconds: number;
  },
  streams: NormalizedStreams,
  primarySignal: SignalType,
  activityDate: Date
): Promise<{
  sessionRole: SessionRole;
  tizSignalOverride: SignalType | null;
  prescriptionSignal: SignalType | null;
}> {
  const linked = await loadLinkedSessionContext(activity.id, activity.athleteId);

  if (linked) {
    let prescriptionSignal: SignalType | null = null;
    if (linked.structuredSteps) {
      const tree = parseWorkoutTree(linked.structuredSteps);
      prescriptionSignal = inferSignalFromWorkoutNodes(
        tree.nodes,
        linked.discipline
      );
    }
    return {
      sessionRole: resolveDisplaySessionRole({
        sessionRole: linked.sessionRole,
        title: linked.title,
        discipline: linked.discipline,
        durationMinutes: linked.estimatedDurationMinutes,
        zoneMinutes:
          linked.targetZones && typeof linked.targetZones === "object"
            ? (linked.targetZones as Record<string, number>)
            : undefined,
      }),
      tizSignalOverride: linked.tizSignalOverride,
      prescriptionSignal,
    };
  }

  const threshold = await getThresholdProfileAtDate(
    activity.athleteId,
    activity.discipline,
    primarySignal,
    activityDate
  );

  return {
    sessionRole: inferSessionRole({
      title: activity.name,
      discipline: activity.discipline,
      durationMinutes: Math.round(activity.durationSeconds / 60),
      streams,
      primarySignal,
      thresholdValue: threshold?.thresholdValue ?? null,
    }),
    tizSignalOverride: null,
    prescriptionSignal: null,
  };
}

export async function computeActivityZones(activityId: string) {
  const activity = await db.syncedActivity.findUnique({
    where: { id: activityId },
    include: { athlete: { include: { disciplineSettings: true } } },
  });
  if (!activity) return;

  const settings = activity.athlete.disciplineSettings.find(
    (s) => s.discipline === activity.discipline
  );
  if (!settings) {
    await db.syncedActivity.update({
      where: { id: activityId },
      data: {
        noUsableSignal: true,
        zoneComputed: true,
        ...ecoClearUpdate(),
      },
    });
    return;
  }

  const streams = normalizeStreamsForZones(
    parseStoredStreams(activity.rawStreams),
    activity.durationSeconds
  );

  const preference = await resolveSignalSettingsForDate(
    activity.athleteId,
    activity.discipline,
    activity.startTime,
    settings
      ? {
          primarySignal: settings.primarySignal,
          fallbackSignal: settings.fallbackSignal,
          roleSignals: parseRoleSignals(
            "roleSignals" in settings ? settings.roleSignals : null
          ),
        }
      : null
  );

  const sessionContext = await resolveSessionContextForActivity(
    activity,
    streams,
    preference.primarySignal,
    activity.startTime
  );
  const signalSettings = resolveSignalForSession(
    activity.discipline,
    preference,
    sessionContext
  );

  const resolved = resolveCanonicalSignal(signalSettings, streams);

  await db.zoneBreakdown.deleteMany({ where: { activityId } });

  if (!resolved) {
    await db.syncedActivity.update({
      where: { id: activityId },
      data: {
        noUsableSignal: true,
        zoneComputed: true,
        ...ecoClearUpdate(),
      },
    });
    return;
  }

  const profile = await getThresholdProfileAtDate(
    activity.athleteId,
    activity.discipline,
    resolved.signal,
    activity.startTime
  );
  if (!profile) {
    await db.syncedActivity.update({
      where: { id: activityId },
      data: {
        noUsableSignal: true,
        zoneComputed: true,
        ...ecoClearUpdate(),
      },
    });
    return;
  }

  const zoneMinutes = computeZoneBreakdown(
    streams,
    profile,
    activity.discipline,
    activity.durationSeconds
  );
  await db.zoneBreakdown.createMany({
    data: Object.entries(zoneMinutes).map(([zone, minutes]) => ({
      activityId,
      zone: Number(zone),
      minutes,
      signalUsed: resolved.signal,
      thresholdProfileId: profile.id,
      isCanonical: true,
      usedFallback: resolved.usedFallback,
    })),
  });

  const secondary: SignalType[] = [];
  if (
    signalSettings.fallbackSignal &&
    signalSettings.fallbackSignal !== resolved.signal &&
    isStreamUsable(streams, signalSettings.fallbackSignal)
  ) {
    secondary.push(signalSettings.fallbackSignal);
  }

  for (const signal of secondary) {
    const p = await getThresholdProfileAtDate(
      activity.athleteId,
      activity.discipline,
      signal,
      activity.startTime
    );
    if (!p) continue;
    const mins = computeZoneBreakdown(
      streams,
      p,
      activity.discipline,
      activity.durationSeconds
    );
    await db.zoneBreakdown.createMany({
      data: Object.entries(mins).map(([zone, minutes]) => ({
        activityId,
        zone: Number(zone),
        minutes,
        signalUsed: signal,
        thresholdProfileId: p.id,
        isCanonical: false,
        usedFallback: false,
      })),
    });
  }

  const priorLegs = await priorLegTypesForActivity({
    athleteId: activity.athleteId,
    multisportGroupId: activity.multisportGroupId,
    sessionIndex: activity.sessionIndex,
    startTime: activity.startTime,
  });
  const transitionBump = ecoTransitionBump({
    discipline: activity.discipline,
    legType: activity.legType,
    priorLegTypes: priorLegs,
  });

  const eco = computeSessionEcos({
    streams,
    signal: resolved.signal,
    thresholdValue: profile.thresholdValue,
    discipline: activity.discipline,
    durationSeconds: activity.durationSeconds,
    transitionBump,
  });

  await db.syncedActivity.update({
    where: { id: activityId },
    data: {
      zoneComputed: true,
      noUsableSignal: false,
      ecos: eco?.ecos ?? null,
      ecoZoneMinutes: eco?.ecoZoneMinutes ?? Prisma.JsonNull,
      ecoComputed: true,
    },
  });
}
