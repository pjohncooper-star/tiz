import { NextResponse } from "next/server";
import { z } from "zod";
import type { Discipline } from "@prisma/client";
import { auth } from "@/lib/auth";
import { parseDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { defaultSessionTitle } from "@/lib/plan/session";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import { inferSessionRole } from "@/lib/plan/session-role";
import { hasTargetZones } from "@/lib/plan/session-target-zones";
import {
  nullableMetric,
  planDisciplineSchema,
  planSessionMetricsSchema,
  poolSlotKindSchema,
  sessionRoleSchema,
  goalEventDisciplineSchema,
  scheduledTimeMinutesSchema,
  workoutTagsSchema,
} from "@/lib/plan/api-schemas";
import { createRaceSessionsOnCalendar } from "@/lib/plan/race-calendar-sync";
import { nextDaySortOrderForDate } from "@/lib/plan/session-day-order.server";
import { syncSessionWorkoutTags } from "@/lib/plan/workout-tags.server";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z
  .object({
    scheduledDate: z.string().regex(DATE_KEY),
    discipline: planDisciplineSchema.optional(),
    disciplines: z.array(goalEventDisciplineSchema).min(1).optional(),
    title: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    tags: workoutTagsSchema.optional(),
    scheduledTimeMinutes: scheduledTimeMinutesSchema.optional(),
    source: z.enum(["FLEXIBLE", "RACE"]).optional(),
    estimatedDurationMinutes: z.number().int().positive().nullable().optional(),
    targetZones: z.record(z.string(), z.number().nonnegative()).optional(),
    sessionRole: sessionRoleSchema.optional(),
    poolSlotKind: poolSlotKindSchema.optional(),
  })
  .merge(planSessionMetricsSchema)
  .refine((d) => d.discipline != null || (d.disciplines?.length ?? 0) > 0, {
    message: "discipline or disciplines required",
  });

export async function POST(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    scheduledDate,
    discipline,
    disciplines,
    title,
    notes,
    tags: tagsInput,
    scheduledTimeMinutes: scheduledTimeMinutesInput,
    targetZones,
    distanceMeters,
    targetSpeedMps,
    targetPaceSeconds,
    poolSize,
    source,
    estimatedDurationMinutes,
    sessionRole: sessionRoleInput,
    poolSlotKind,
  } = parsed.data;

  const scheduled = parseDateKey(scheduledDate);
  const isRace = source === "RACE";

  if (isRace) {
    const raceDisciplines = disciplines ?? (discipline ? [discipline as "SWIM" | "BIKE" | "RUN"] : []);
    const raceName = title?.trim() || "Race";
    const legs = await db.$transaction((tx) =>
      createRaceSessionsOnCalendar(tx, {
        athleteId,
        scheduledDate: scheduled,
        name: raceName,
        disciplines: raceDisciplines,
        distanceMeters: nullableMetric(distanceMeters) ?? null,
        estimatedDurationMinutes: nullableMetric(estimatedDurationMinutes) ?? null,
        notes: notes || null,
      })
    );
    return NextResponse.json({ sessions: legs, session: legs[0] }, { status: 201 });
  }

  const resolvedDiscipline = discipline as Discipline;
  const sessionTitle =
    title?.trim() ||
    (resolvedDiscipline === "BIKE" ||
    resolvedDiscipline === "RUN" ||
    resolvedDiscipline === "SWIM"
      ? defaultSessionTitle(resolvedDiscipline)
      : "Session");
  const zonesJson =
    targetZones && hasTargetZones(targetZones) ? targetZones : undefined;

  const zoneAllocationMissing = computeZoneAllocationMissing(
    resolvedDiscipline,
    zonesJson
  );

  const sessionRole =
    sessionRoleInput ??
    inferSessionRole({
      title: sessionTitle,
      discipline: resolvedDiscipline,
    });

  const tags =
    tagsInput !== undefined
      ? await syncSessionWorkoutTags(db, athleteId, tagsInput)
      : [];

  const scheduledTimeMinutes =
    scheduledTimeMinutesInput === undefined ? null : scheduledTimeMinutesInput;
  const daySortOrder =
    scheduledTimeMinutes == null
      ? await nextDaySortOrderForDate(db, athleteId, scheduled)
      : 0;

  const plannedSession = await db.plannedSession.create({
    data: {
      athleteId,
      scheduledDate: scheduled,
      scheduledTimeMinutes,
      daySortOrder,
      discipline: resolvedDiscipline,
      title: sessionTitle,
      notes: notes || null,
      tags,
      targetZones: zonesJson,
      zoneAllocationMissing,
      sessionRole,
      poolSlotKind: poolSlotKind ?? null,
      distanceMeters: nullableMetric(distanceMeters) ?? null,
      targetSpeedMps: resolvedDiscipline === "BIKE" ? nullableMetric(targetSpeedMps) ?? null : null,
      targetPaceSeconds:
        resolvedDiscipline === "RUN" || resolvedDiscipline === "SWIM"
          ? nullableMetric(targetPaceSeconds) ?? null
          : null,
      poolSize: resolvedDiscipline === "SWIM" ? (poolSize ?? null) : null,
      estimatedDurationMinutes: nullableMetric(estimatedDurationMinutes) ?? null,
    },
    include: { structuredWorkout: true },
  });

  return NextResponse.json({ session: plannedSession }, { status: 201 });
}
