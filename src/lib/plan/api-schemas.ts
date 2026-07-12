import { z } from "zod";

const DISCIPLINES = ["BIKE", "RUN", "SWIM"] as const;

export const planStepSchema = z.object({
  type: z.enum(["steady", "warmup", "cooldown", "rest"]),
  durationMinutes: z.number().positive(),
  targetZone: z.number().int().min(1).max(7),
  distanceMeters: z.number().positive().optional(),
  targetSpeedMps: z.number().positive().optional(),
  targetPaceSeconds: z.number().positive().optional(),
});

const stepDurationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("time"), value: z.number().positive() }),
  z.object({ type: z.literal("distance"), value: z.number().positive() }),
  z.object({
    type: z.literal("open"),
    estimateSeconds: z.number().positive().optional(),
  }),
]);

const stepTargetSchema = z.object({
  signal: z.enum(["power", "heart_rate", "pace", "speed", "open"]),
  mode: z.enum(["zone", "range", "value"]),
  zone: z.number().int().min(1).max(7).optional(),
  low: z.number().optional(),
  high: z.number().optional(),
  value: z.number().optional(),
});

const rampTargetSchema = z.object({
  signal: z.enum(["power", "heart_rate", "pace", "speed"]),
  low: z.number(),
  high: z.number(),
  mode: z.enum(["zone", "range"]).optional(),
  lowZone: z.number().int().min(1).max(7).optional(),
  highZone: z.number().int().min(1).max(7).optional(),
});

export const leafStepSchema = z.object({
  kind: z.literal("step"),
  intensity: z.enum(["warmup", "active", "recovery", "rest", "cooldown", "interval"]),
  duration: stepDurationSchema,
  target: stepTargetSchema,
  distanceMeters: z.number().positive().optional(),
  targetSpeedMps: z.number().positive().optional(),
  targetPaceSeconds: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const swimIntervalSetSchema = z
  .object({
    kind: z.literal("swim_interval"),
    repeatCount: z.number().int().positive(),
    distanceMeters: z.number().positive(),
    restMode: z.enum(["sendoff", "fixed"]),
    sendOffSeconds: z.number().positive().optional(),
    fixedRestSeconds: z.number().positive().optional(),
    target: stepTargetSchema,
    targetPaceSeconds: z.number().positive().optional(),
    notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.restMode === "sendoff" && (val.sendOffSeconds == null || val.sendOffSeconds <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sendOffSeconds required for sendoff mode" });
    }
    if (val.restMode === "fixed" && (val.fixedRestSeconds == null || val.fixedRestSeconds <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "fixedRestSeconds required for fixed mode" });
    }
  });

export const rampStepSchema = z.object({
  kind: z.literal("ramp"),
  duration: z.object({ type: z.literal("time"), value: z.number().positive() }),
  target: rampTargetSchema,
  notes: z.string().optional(),
});

export const workoutNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    leafStepSchema,
    z.object({
      kind: z.literal("repeat"),
      repeatCount: z.number().int().positive(),
      children: z.array(workoutNodeSchema),
      notes: z.string().optional(),
    }),
    rampStepSchema,
    swimIntervalSetSchema,
  ])
);

export const workoutTreeDocumentSchema = z.object({
  version: z.literal(2),
  nodes: z.array(workoutNodeSchema),
});

/** Accepts legacy flat steps or v2 workout tree document. */
export const stepsPayloadSchema = z.union([
  workoutTreeDocumentSchema,
  z.array(planStepSchema),
]);

export const planSessionMetricsSchema = z.object({
  distanceMeters: z.number().positive().nullable().optional(),
  targetSpeedMps: z.number().positive().nullable().optional(),
  targetPaceSeconds: z.number().positive().nullable().optional(),
  poolSize: z.enum(["SCY", "SCM", "LCM"]).nullable().optional(),
});

export const planSessionCompletedMetricsSchema = z.object({
  completedDurationMinutes: z.number().positive().nullable().optional(),
  completedDistanceMeters: z.number().positive().nullable().optional(),
  completedTargetSpeedMps: z.number().positive().nullable().optional(),
  completedTargetPaceSeconds: z.number().positive().nullable().optional(),
  completedZones: z.record(z.string(), z.number().nonnegative()).nullable().optional(),
  clearCompletedOverrides: z.boolean().optional(),
});

export const planDisciplineSchema = z.enum(DISCIPLINES);

export const sessionRoleSchema = z.enum(["EASY", "MODERATE", "INTENSITY", "LONG"]);

export function nullableMetric(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value > 0 ? value : null;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const phaseKindSchema = z.enum(["BASE", "BUILD", "RACE_PREP", "TAPER"]);
export const phaseFocusSchema = z.enum([
  "AEROBIC_BASE",
  "THRESHOLD",
  "VO2_MAX",
  "RACE_SPECIFICITY",
  "FRESHNESS",
  "STRENGTH_POWER",
  "MAINTENANCE",
]);
export const goalEventDisciplineSchema = z.enum(["SWIM", "BIKE", "RUN"]);

export const seasonGoalEventSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  date: z.string().regex(DATE_KEY),
  disciplines: z.array(goalEventDisciplineSchema).min(1),
  distanceMeters: z.number().positive().nullable().optional(),
  estimatedDurationMinutes: z.number().int().positive().nullable().optional(),
  swimGoalMinutes: z.number().int().positive().nullable().optional(),
  bikeGoalMinutes: z.number().int().positive().nullable().optional(),
  runGoalMinutes: z.number().int().positive().nullable().optional(),
  taperDaysBefore: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const removedGoalEventSchema = z.object({
  id: z.string().min(1),
  deleteFromCalendar: z.boolean().optional(),
});

export const applyWorkoutTemplateSchema = z.object({
  workoutTemplateId: z.string().min(1),
});

export const createWorkoutFolderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentFolderId: z.string().min(1).nullable().optional(),
  folderKind: z.enum(["LIBRARY", "PROGRESSION"]).optional(),
  discipline: planDisciplineSchema.nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updateWorkoutFolderSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  parentFolderId: z.string().min(1).nullable().optional(),
  discipline: planDisciplineSchema.nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const createFolderWorkoutSchema = z.object({
  name: z.string().trim().min(1).max(200),
  discipline: planDisciplineSchema,
  steps: stepsPayloadSchema.optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updateFolderWorkoutSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  discipline: planDisciplineSchema.optional(),
  steps: stepsPayloadSchema.optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  folderId: z.string().min(1).nullable().optional(),
});

export const reorderFolderWorkoutsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const reorderFoldersSchema = z.object({
  parentFolderId: z.string().min(1).nullable(),
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const componentTypeSchema = z.enum([
  "WARMUP",
  "PRIMER",
  "MAIN_SET",
  "COOLDOWN",
  "DRILL",
  "RECOVERY",
  "OTHER",
]);

/** Legacy workout component library (pre–workout-folder migration). */
export const createWorkoutComponentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  discipline: planDisciplineSchema,
  componentType: componentTypeSchema,
  notes: z.string().nullable().optional(),
  steps: stepsPayloadSchema,
});

export const updateWorkoutComponentSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    discipline: planDisciplineSchema.optional(),
    componentType: componentTypeSchema.optional(),
    notes: z.string().nullable().optional(),
    steps: stepsPayloadSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

const simpleDisciplineRampSchema = z.object({
  mode: z.enum(["HOURS", "DISTANCE"]).optional(),
  startHours: z.number().nonnegative(),
  peakHours: z.number().nonnegative(),
  ratePercent: z.number().min(0).max(100),
  startDistanceMeters: z.number().nonnegative().optional(),
  peakDistanceMeters: z.number().nonnegative().optional(),
  referencePaceSeconds: z.number().positive().optional(),
});

const zoneSplitPercentsSchema = z.object({
  z1: z.number().min(0).max(100),
  z2: z.number().min(0).max(100),
  z3: z.number().min(0).max(100),
  z4: z.number().min(0).max(100),
  z5: z.number().min(0).max(100),
});

const disciplineZoneSplitSchema = z.object({
  mode: z.enum(["preset", "custom"]),
  focus: phaseFocusSchema.optional(),
  percents: zoneSplitPercentsSchema.optional(),
});

const phaseZoneSplitsSchema = z.object({
  SWIM: disciplineZoneSplitSchema,
  BIKE: disciplineZoneSplitSchema,
  RUN: disciplineZoneSplitSchema,
});

export const phaseKindZoneDefaultsSchema = z.object({
  BASE: phaseZoneSplitsSchema,
  BUILD: phaseZoneSplitsSchema,
  RACE_PREP: phaseZoneSplitsSchema,
  TAPER: phaseZoneSplitsSchema,
});

export const simpleRampDefaultsSchema = z.object({
  swim: simpleDisciplineRampSchema,
  bike: simpleDisciplineRampSchema,
  run: simpleDisciplineRampSchema,
});

export const simplePhaseSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    color: z.string().min(1),
    phaseKind: phaseKindSchema,
    startWeekIndex: z.number().int(),
    endWeekIndex: z.number().int(),
    rampEnabled: z.object({
      swim: z.boolean(),
      bike: z.boolean(),
      run: z.boolean(),
    }),
    swimSessionsPerWeek: z.number().int().min(0).max(7),
    bikeSessionsPerWeek: z.number().int().min(0).max(7),
    runSessionsPerWeek: z.number().int().min(0).max(7),
    strengthSessionsPerWeek: z.number().int().min(0).max(7),
    swimIntenseDaysPerWeek: z.number().int().min(0).max(7),
    bikeIntenseDaysPerWeek: z.number().int().min(0).max(7),
    runIntenseDaysPerWeek: z.number().int().min(0).max(7),
    goal: z.string().nullable().optional(),
    zoneSplits: phaseZoneSplitsSchema.nullable().optional(),
  })
  .refine(
    (phase) =>
      (phase.startWeekIndex < 0 && phase.endWeekIndex < 0) ||
      (phase.startWeekIndex >= 0 &&
        phase.endWeekIndex >= phase.startWeekIndex),
    { message: "Invalid phase week span" }
  );

export const simpleWeekSchema = z.object({
  weekIndex: z.number().int().nonnegative(),
  isRestWeek: z.boolean(),
  swimHours: z.number().nonnegative(),
  bikeHours: z.number().nonnegative(),
  runHours: z.number().nonnegative(),
  swimDistanceMeters: z.number().nonnegative().nullable().optional(),
  runDistanceMeters: z.number().nonnegative().nullable().optional(),
});

export const createSimpleSeasonSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().regex(DATE_KEY),
  endDate: z.string().regex(DATE_KEY),
  rampDefaults: simpleRampDefaultsSchema.optional(),
  goalEvent: seasonGoalEventSchema.optional(),
  bGoalEvents: z.array(seasonGoalEventSchema).optional(),
  cGoalEvents: z.array(seasonGoalEventSchema).optional(),
});

export const updateSimpleSeasonSchema = z
  .object({
    name: z.string().min(1).optional(),
    startDate: z.string().regex(DATE_KEY).optional(),
    endDate: z.string().regex(DATE_KEY).optional(),
    rampDefaults: simpleRampDefaultsSchema.optional(),
    phaseKindZoneDefaults: phaseKindZoneDefaultsSchema.optional(),
    phases: z.array(simplePhaseSchema).optional(),
    weeks: z.array(simpleWeekSchema).optional(),
    recalculate: z.boolean().optional(),
    goalEvent: seasonGoalEventSchema.optional(),
    bGoalEvents: z.array(seasonGoalEventSchema).optional(),
    cGoalEvents: z.array(seasonGoalEventSchema).optional(),
    removedGoalEvents: z.array(removedGoalEventSchema).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });
