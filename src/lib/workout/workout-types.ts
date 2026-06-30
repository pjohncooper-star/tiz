export type WorkoutStepType = "steady" | "warmup" | "cooldown" | "rest";

export type WorkoutStep = {
  type: WorkoutStepType;
  durationMinutes: number;
  targetZone: number;
  distanceMeters?: number;
  targetSpeedMps?: number;
  targetPaceSeconds?: number;
};

export type ZoneMinutes = Record<string, number>;
