import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { setOnboardingStep } from "@/lib/onboarding";
import { isValidWorkoutShadingMode, type WorkoutShadingMode } from "@/lib/plan/workout-shading";
import {
  getPreferenceDateRange,
  syncCurrentPreferenceToSettings,
  upsertSignalPreference,
  validatePrimarySignal,
} from "@/lib/zones/signal-preference";
import { recomputeAfterPreferenceChange } from "@/lib/zones/recompute-zones";
import { validateSelfEvalConfig } from "@/lib/survey/self-eval-config";
import type { Discipline } from "@prisma/client";
const settingsSchema = z.object({
  discipline: z.enum(["BIKE", "RUN", "SWIM"]),
  primarySignal: z.enum(["POWER", "HEART_RATE", "PACE"]),
  fallbackSignal: z.enum(["POWER", "HEART_RATE", "PACE"]).nullable(),
  displayUnit: z.enum(["METRIC", "IMPERIAL"]),
});

const thresholdSchema = z.object({
  discipline: z.enum(["BIKE", "RUN", "SWIM"]),
  signalType: z.enum(["POWER", "HEART_RATE", "PACE"]),
  thresholdValue: z.number().positive(),
  zoneCount: z.number().int().min(3).max(7),
  zoneBoundaries: z.array(z.number()),
  effectiveDate: z.string(),
  isEstimated: z.boolean(),
});

const signalPreferenceSchema = z.object({
  discipline: z.enum(["BIKE", "RUN", "SWIM"]),
  primarySignal: z.enum(["POWER", "HEART_RATE", "PACE"]),
  effectiveDate: z.string(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [settings, thresholds, signalPreferences, athlete] = await Promise.all([
    db.athleteDisciplineSettings.findMany({ where: { athleteId: session.user.athleteId } }),
    db.thresholdProfile.findMany({
      where: { athleteId: session.user.athleteId },
      orderBy: { effectiveDate: "desc" },
    }),
    db.signalPreference.findMany({
      where: { athleteId: session.user.athleteId },
      orderBy: { effectiveDate: "desc" },
    }),
    db.athlete.findUnique({ where: { id: session.user.athleteId } }),
  ]);
  return NextResponse.json({
    settings,
    thresholds,
    signalPreferences,
    onboardingStep: athlete?.onboardingStep,
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const athleteId = session.user.athleteId;

  if (body.type === "profile") {
    await db.user.update({
      where: { id: session.user.id },
      data: { name: body.name },
    });
    await setOnboardingStep(athleteId, "THRESHOLDS");
    return NextResponse.json({ ok: true });
  }

  if (body.type === "settings") {
    const data = settingsSchema.parse(body.data);
    await db.athleteDisciplineSettings.update({
      where: { athleteId_discipline: { athleteId, discipline: data.discipline } },
      data,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "discipline-units") {
    try {
      const data = z
        .object({
          discipline: z.enum(["BIKE", "RUN", "SWIM"]),
          displayUnit: z.enum(["METRIC", "IMPERIAL"]).optional(),
          poolSize: z.enum(["SCY", "SCM", "LCM"]).nullable().optional(),
        })
        .parse(body.data);

      const update: {
        displayUnit?: "METRIC" | "IMPERIAL";
        poolSize?: "SCY" | "SCM" | "LCM" | null;
      } = {};
      if (data.displayUnit !== undefined) update.displayUnit = data.displayUnit;
      if (data.discipline === "SWIM" && data.poolSize !== undefined) {
        update.poolSize = data.poolSize;
      }
      if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      await db.athleteDisciplineSettings.update({
        where: { athleteId_discipline: { athleteId, discipline: data.discipline } },
        data: update,
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("discipline-units update failed:", error);
      const message =
        error instanceof z.ZodError
          ? "Invalid unit settings"
          : error instanceof Error &&
              /poolSize|PoolSize|column/.test(error.message)
            ? "Pool size is not available yet. Run prisma/migrations/manual_pool_size.sql, then restart the dev server."
            : "Could not save unit settings";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.type === "self-eval") {
    try {
      const config = validateSelfEvalConfig(body.data);
      await db.athlete.update({
        where: { id: athleteId },
        data: { selfEvalConfig: config },
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message =
        error instanceof Error &&
        /selfEvalConfig|SelfEvalConfig|column/.test(error.message)
          ? "Self-eval settings are not available yet. Run prisma/migrations/manual_self_eval_config.sql, then run npx prisma generate and restart the dev server."
          : error instanceof Error
            ? error.message
            : "Could not save self-eval settings";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.type === "workout-shading") {
    try {
      const data = z
        .object({
          discipline: z.enum(["BIKE", "RUN", "SWIM", "STRENGTH"]),
          pastWorkoutShading: z.enum([
            "OFF",
            "DURATION",
            "ELAPSED_DURATION",
            "MOVING_DURATION",
            "DISTANCE",
            "TIZ",
          ]),
        })
        .parse(body.data);

      const discipline = data.discipline as Discipline;
      const mode = data.pastWorkoutShading as WorkoutShadingMode;
      if (!isValidWorkoutShadingMode(discipline, mode)) {
        return NextResponse.json({ error: "Invalid shading mode for sport" }, { status: 400 });
      }

      if (discipline === "STRENGTH") {
        await db.athlete.update({
          where: { id: athleteId },
          data: { strengthPastWorkoutShading: mode },
        });
        return NextResponse.json({ ok: true });
      }

      await db.athleteDisciplineSettings.update({
        where: { athleteId_discipline: { athleteId, discipline } },
        data: { pastWorkoutShading: mode },
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("workout-shading update failed:", error);
      const message =
        error instanceof z.ZodError
          ? "Invalid workout shading settings"
          : error instanceof Error &&
              /pastWorkoutShading|PastWorkoutShading|strengthPastWorkoutShading|column/.test(
                error.message
              )
            ? "Workout shading is not available yet. Run prisma/migrations/manual_past_workout_shading.sql, then run npx prisma generate and restart the dev server."
            : error instanceof Error
              ? error.message
              : "Could not save workout shading";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.type === "threshold") {
    const data = thresholdSchema.parse(body.data);
    await db.thresholdProfile.upsert({
      where: {
        athleteId_discipline_signalType_effectiveDate: {
          athleteId,
          discipline: data.discipline,
          signalType: data.signalType,
          effectiveDate: new Date(data.effectiveDate),
        },
      },
      create: { athleteId, ...data, effectiveDate: new Date(data.effectiveDate) },
      update: { ...data, effectiveDate: new Date(data.effectiveDate) },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "complete-thresholds") {
    await setOnboardingStep(athleteId, "HISTORICAL_THRESHOLDS");
    return NextResponse.json({ ok: true });
  }

  if (body.type === "complete-historical-thresholds") {
    await setOnboardingStep(athleteId, "IMPORT");
    return NextResponse.json({ ok: true });
  }

  if (body.type === "set-step") {
    const step = z
      .enum([
        "PROFILE",
        "THRESHOLDS",
        "HISTORICAL_THRESHOLDS",
        "IMPORT",
        "STRAVA",
        "DAY_FLAGS",
        "COMPLETE",
      ])
      .parse(body.step);
    await setOnboardingStep(athleteId, step);
    return NextResponse.json({ ok: true });
  }

  if (body.type === "delete-threshold") {
    const id = z.string().parse(body.id);
    const row = await db.thresholdProfile.findFirst({
      where: { id, athleteId },
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db.thresholdProfile.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "signal-preference") {
    try {
      const data = signalPreferenceSchema.parse(body.data);
      validatePrimarySignal(data.discipline, data.primarySignal);
      const effectiveDate = new Date(data.effectiveDate);
      const row = await upsertSignalPreference(
        athleteId,
        data.discipline,
        data.primarySignal,
        effectiveDate
      );
      const { from, to } = await getPreferenceDateRange(row);
      await recomputeAfterPreferenceChange(athleteId, data.discipline, from, to);
      return NextResponse.json({ ok: true, id: row.id });
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? "Invalid signal preference"
          : error instanceof Error
            ? error.message
            : "Could not save signal preference";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.type === "delete-signal-preference") {
    const id = z.string().parse(body.id);
    const row = await db.signalPreference.findFirst({
      where: { id, athleteId },
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const from = row.effectiveDate;
    const next = await db.signalPreference.findFirst({
      where: {
        athleteId,
        discipline: row.discipline,
        effectiveDate: { gt: row.effectiveDate },
      },
      orderBy: { effectiveDate: "asc" },
      select: { effectiveDate: true },
    });
    const to = next?.effectiveDate ?? null;
    await db.signalPreference.delete({ where: { id } });
    await syncCurrentPreferenceToSettings(athleteId, row.discipline);
    await recomputeAfterPreferenceChange(athleteId, row.discipline, from, to);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
