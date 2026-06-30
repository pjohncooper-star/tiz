import { db } from "@/lib/db";
import {
  computeZoneBreakdown,
  isStreamUsable,
  type NormalizedStreams,
  resolveCanonicalSignal,
} from "@/lib/zones/compute";
import { normalizeStreamsForZones } from "@/lib/zones/normalize-streams";
import { resolveSignalSettingsForDate } from "@/lib/zones/signal-preference";
import { getThresholdProfileAtDate } from "@/lib/zones/thresholds";
import type { SignalType } from "@prisma/client";

export function parseStoredStreams(raw: unknown): NormalizedStreams {
  if (!raw || typeof raw !== "object") return {};
  return raw as NormalizedStreams;
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
      data: { noUsableSignal: true, zoneComputed: true },
    });
    return;
  }

  const streams = normalizeStreamsForZones(
    parseStoredStreams(activity.rawStreams),
    activity.durationSeconds
  );

  const signalSettings = await resolveSignalSettingsForDate(
    activity.athleteId,
    activity.discipline,
    activity.startTime,
    settings
      ? {
          primarySignal: settings.primarySignal,
          fallbackSignal: settings.fallbackSignal,
        }
      : null
  );

  const resolved = resolveCanonicalSignal(signalSettings, streams);

  await db.zoneBreakdown.deleteMany({ where: { activityId } });

  if (!resolved) {
    await db.syncedActivity.update({
      where: { id: activityId },
      data: { noUsableSignal: true, zoneComputed: true },
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
      data: { noUsableSignal: true, zoneComputed: true },
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

  await db.syncedActivity.update({
    where: { id: activityId },
    data: { zoneComputed: true, noUsableSignal: false },
  });
}
