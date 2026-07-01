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

export const anchorWorkoutTypeSchema = z.enum(["BIKE", "RUN", "SWIM", "STRENGTH"]);

export function nullableMetric(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value > 0 ? value : null;
}

export const anchorWorkoutSchema = z.object({
  title: z.string().min(1),
  discipline: anchorWorkoutTypeSchema,
  weekday: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  durationMinutes: z.number().int().positive().nullable().optional(),
  distanceMeters: z.number().positive().nullable().optional(),
  targetSpeedMps: z.number().positive().nullable().optional(),
  targetPaceSeconds: z.number().positive().nullable().optional(),
  targetZones: z.record(z.string(), z.number().nonnegative()).nullable().optional(),
    steps: stepsPayloadSchema.optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  respectTaper: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  workoutTemplateId: z.string().nullable().optional(),
});

export const materializeWeekSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

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
export const focusModeSchema = z.enum(["PHASE", "DISCIPLINE"]);
export const deLoadStrategySchema = z.enum([
  "VOLUME_ONLY",
  "VOLUME_AND_INTENSITY",
  "SINGLE_SPORT_FOCUS",
]);
export const goalEventDisciplineSchema = z.enum(["SWIM", "BIKE", "RUN"]);
export const sportTemplateSchema = z.enum(["TRIATHLON"]);

export const seasonPhaseDisciplineFocusSchema = z.object({
  discipline: planDisciplineSchema,
  focus: phaseFocusSchema,
});

export const seasonMesocycleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  weekCount: z.number().int().positive(),
});

export const seasonPhaseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  weekCount: z.number().int().positive(),
  phaseKind: phaseKindSchema,
  color: z.string().optional(),
  coachNotes: z.string().nullable().optional(),
  focusMode: focusModeSchema,
  phaseFocus: phaseFocusSchema.nullable().optional(),
  disciplineFocuses: z.array(seasonPhaseDisciplineFocusSchema).optional(),
  mesocycles: z.array(seasonMesocycleSchema).optional(),
  swimSessionsPerWeek: z.number().int().nonnegative(),
  bikeSessionsPerWeek: z.number().int().nonnegative(),
  runSessionsPerWeek: z.number().int().nonnegative(),
});

export const seasonGoalEventSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  date: z.string().regex(DATE_KEY),
  disciplines: z.array(goalEventDisciplineSchema).min(1),
  distanceMeters: z.number().positive().nullable().optional(),
  estimatedDurationMinutes: z.number().int().positive().nullable().optional(),
  taperDaysBefore: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const removedGoalEventSchema = z.object({
  id: z.string().min(1),
  deleteFromCalendar: z.boolean().optional(),
});

export const linkCalendarRaceSchema = seasonGoalEventSchema.extend({
  plannedSessionId: z.string().min(1),
  priority: z.enum(["A", "B", "C"]),
});

/** Step 0 — season setup (dates + races). */
export const seasonWizardStep0Schema = z.object({
  name: z.string().min(1),
  startDate: z.string().regex(DATE_KEY),
  endDate: z.string().regex(DATE_KEY),
  goalEvent: seasonGoalEventSchema,
  bGoalEvents: z.array(seasonGoalEventSchema).optional(),
  cGoalEvents: z.array(seasonGoalEventSchema).optional(),
  removedGoalEvents: z.array(removedGoalEventSchema).optional(),
  linkCalendarRaces: z.array(linkCalendarRaceSchema).optional(),
});

/** Step 1 — cycle structure and mesocycles. */
export const seasonWizardStep1Schema = z.object({
  mesocycleLengthWeeks: z.number().int().min(2).max(6),
  phases: z.array(seasonPhaseSchema).min(1),
});

/** Step 2 — de-load cadence and per-week flags. */
export const seasonWizardStep2Schema = z.object({
  deLoadEveryNWeeks: z.number().int().min(2).max(8).optional(),
  deLoadVolumePercent: z.number().min(30).max(90).optional(),
  deLoadStrategy: deLoadStrategySchema.optional(),
  reduceCountsOnDeLoad: z.boolean().optional(),
  deLoadCountScalePercent: z.number().min(10).max(90).nullable().optional(),
  deLoadWeekFlags: z.array(z.boolean()).optional(),
});

/** Step 3 — goals / focus per phase. */
export const seasonWizardStep3Schema = z.object({
  phases: z.array(seasonPhaseSchema).min(1),
});

/** Step 4 — volume ramp and long sessions. */
export const seasonWizardStep4Schema = z.object({
  startHours: z.number().positive(),
  peakHours: z.number().positive(),
  maxRampPercent: z.number().min(0).max(25).optional(),
  longRideStartMin: z.number().int().positive().optional(),
  longRidePeakMin: z.number().int().positive().optional(),
  longRunStartMin: z.number().int().positive().optional(),
  longRunPeakMin: z.number().int().positive().optional(),
});

/** Step 5 — sessions per week; may mark setup complete. */
export const seasonWizardStep5Schema = z.object({
  phases: z.array(seasonPhaseSchema).min(1),
  setupComplete: z.literal(true).optional(),
});

export const createSeasonPlanSchema = seasonWizardStep0Schema
  .merge(seasonWizardStep1Schema.partial())
  .merge(seasonWizardStep4Schema.partial())
  .merge(seasonWizardStep3Schema.partial())
  .extend({
    sportTemplate: sportTemplateSchema.optional(),
    phases: z.array(seasonPhaseSchema).optional(),
  });

export const updateSeasonPlanSchema = z
  .object({
    name: z.string().min(1).optional(),
    startDate: z.string().regex(DATE_KEY).optional(),
    endDate: z.string().regex(DATE_KEY).optional(),
    sportTemplate: sportTemplateSchema.optional(),
    mesocycleLengthWeeks: z.number().int().min(2).max(6).optional(),
    phases: z.array(seasonPhaseSchema).optional(),
    startHours: z.number().positive().optional(),
    peakHours: z.number().positive().optional(),
    maxRampPercent: z.number().min(0).max(25).optional(),
    longRideStartMin: z.number().int().positive().optional(),
    longRidePeakMin: z.number().int().positive().optional(),
    longRunStartMin: z.number().int().positive().optional(),
    longRunPeakMin: z.number().int().positive().optional(),
    deLoadEveryNWeeks: z.number().int().min(2).max(8).optional(),
    deLoadWeekFlags: z.array(z.boolean()).nullable().optional(),
    deLoadVolumePercent: z.number().min(30).max(90).optional(),
    deLoadStrategy: deLoadStrategySchema.optional(),
    reduceCountsOnDeLoad: z.boolean().optional(),
    deLoadCountScalePercent: z.number().min(10).max(90).nullable().optional(),
    goalEvent: seasonGoalEventSchema.optional(),
    bGoalEvents: z.array(seasonGoalEventSchema).optional(),
    cGoalEvents: z.array(seasonGoalEventSchema).optional(),
    removedGoalEvents: z.array(removedGoalEventSchema).optional(),
    linkCalendarRaces: z.array(linkCalendarRaceSchema).optional(),
    setupComplete: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

export const anchorWorkoutWithSeasonSchema = anchorWorkoutSchema.extend({
  seasonPlanId: z.string().nullable().optional(),
  seasonPhaseId: z.string().nullable().optional(),
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
