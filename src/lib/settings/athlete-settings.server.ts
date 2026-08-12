import { db } from "@/lib/db";

/**
 * Athlete columns backing the settings pages. Newer columns are dropped from the
 * select and retried when a deployment's database has not been migrated yet, so
 * callers must narrow with `"column" in athlete` before reading one.
 */
export async function loadAthleteSettingsProfile(athleteId: string) {
  try {
    return await db.athlete.findUnique({
      where: { id: athleteId },
      select: {
        strengthPastWorkoutShading: true,
        selfEvalConfig: true,
        workoutShadingTarget: true,
        phaseKindZoneDefaults: true,
        zoneFocusCatalog: true,
        swimEquipmentCatalog: true,
        racePaceAnchors: true,
        ecoLoadEnabled: true,
        calendarFeedToken: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /phaseKindZoneDefaults|PhaseKindZoneDefaults|zoneFocusCatalog|ZoneFocusCatalog|swimEquipmentCatalog|racePaceAnchors|ecoLoadEnabled|calendarFeedToken|column/.test(
        error.message
      )
    ) {
      try {
        return await db.athlete.findUnique({
          where: { id: athleteId },
          select: {
            strengthPastWorkoutShading: true,
            selfEvalConfig: true,
            workoutShadingTarget: true,
            ecoLoadEnabled: true,
            calendarFeedToken: true,
          },
        });
      } catch (inner) {
        if (
          inner instanceof Error &&
          /ecoLoadEnabled|calendarFeedToken|column/.test(inner.message)
        ) {
          try {
            return await db.athlete.findUnique({
              where: { id: athleteId },
              select: {
                strengthPastWorkoutShading: true,
                selfEvalConfig: true,
                workoutShadingTarget: true,
                calendarFeedToken: true,
              },
            });
          } catch (inner2) {
            if (
              inner2 instanceof Error &&
              /calendarFeedToken|column/.test(inner2.message)
            ) {
              return db.athlete.findUnique({
                where: { id: athleteId },
                select: {
                  strengthPastWorkoutShading: true,
                  selfEvalConfig: true,
                  workoutShadingTarget: true,
                },
              });
            }
            throw inner2;
          }
        }
        throw inner;
      }
    }
    throw error;
  }
}

export type AthleteSettingsProfile = Awaited<
  ReturnType<typeof loadAthleteSettingsProfile>
>;

export function loadDisciplineSettingRows(athleteId: string) {
  return db.athleteDisciplineSettings.findMany({ where: { athleteId } });
}
