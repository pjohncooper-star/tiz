import { parseSingleUploadFile } from "@/lib/import/parse-single";
import { upsertImportedActivity } from "@/lib/import/persist";
import { tryAutoLinkActivityToPlannedSession } from "@/lib/plan/session-link";
import { computeActivityZones } from "@/lib/zones/process-activity";

export class SingleImportError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SingleImportError";
  }
}

export async function importSingleUploadFile(
  athleteId: string,
  fileName: string,
  buffer: Uint8Array,
  scheduledDateKey?: string
) {
  const parsed = parseSingleUploadFile(fileName, buffer);
  if (!parsed) {
    throw new SingleImportError(
      "Could not read this file. Supported: .fit, .gpx, .tcx (and .gz variants).",
      400
    );
  }

  const activities = [];
  for (const item of parsed.activities) {
    const activity = await upsertImportedActivity(athleteId, null, item, "BULK_IMPORT", {
      deferZoneCompute: true,
    });
    try {
      await computeActivityZones(activity.id);
    } catch (e) {
      console.error(
        `[import] zone compute failed for ${activity.id}:`,
        e instanceof Error ? e.message : e
      );
    }
    const link = await tryAutoLinkActivityToPlannedSession(athleteId, activity.id, {
      matchDateKey: scheduledDateKey,
    });
    activities.push({
      id: activity.id,
      name: activity.name,
      discipline: activity.discipline,
      startTime: activity.startTime.toISOString(),
      linkedSessionId: link?.sessionId ?? null,
    });
  }
  return { kind: "activity" as const, activities };
}
