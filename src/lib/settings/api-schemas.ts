import { z } from "zod";

const roleSignalValue = z.enum(["POWER", "HEART_RATE", "PACE"]);

/**
 * Sparse role overrides. partialRecord, not record: `z.record` over an enum key
 * requires every key, which would reject the sparse maps clients send.
 */
export const roleSignalsSchema = z
  .partialRecord(z.enum(["EASY", "MODERATE", "INTENSITY", "LONG"]), roleSignalValue)
  .optional();

export const maxHeartRateSchema = z.object({
  maxHeartRateBpm: z.number().int().min(80).max(250).nullable(),
});

export const signalPreferenceSchema = z.object({
  discipline: z.enum(["BIKE", "RUN", "SWIM"]),
  primarySignal: z.enum(["POWER", "HEART_RATE", "PACE"]),
  effectiveDate: z.string(),
  /** Omit to keep existing; pass {} to clear. */
  roleSignals: roleSignalsSchema,
});
