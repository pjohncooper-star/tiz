/** TrainerRoad iCal parse, intensity mapping, and calendar ingest. */

export { parseIcsCalendarName, parseIcsEvents, unfoldIcsLines, type IcsEvent } from "./ics";
export {
  TR_EASY_IF_MAX,
  TR_INTENSITY_IF_MIN,
  TR_LONG_MINUTES,
  durationMinutesFromTssIf,
  inferTrainerRoadSessionRole,
  parseTrainerRoadDurationMinutes,
  parseTrainerRoadIntensityFactor,
  parseTrainerRoadTss,
  trainerRoadDescriptionForcesIntensity,
  trainerRoadTitleWithoutDuration,
} from "./intensity";
export {
  isTrainerRoadPhaseMarker,
  matchTrainerRoadPhaseSummary,
  trainerRoadMarkersToPhaseSpans,
  trainerRoadMarkersToSeasonPhases,
  type TrainerRoadPhaseMarker,
  type TrainerRoadPhaseSpan,
} from "./phases";
export {
  dedupeTrainerRoadWorkouts,
  parseTrainerRoadCalendar,
  type ParsedTrainerRoadCalendar,
  type TrainerRoadWorkout,
} from "./calendar";
export {
  applyTrainerRoadBikeWeekTarget,
  lastTrainerRoadWorkoutDateKey,
  mergeTrainerRoadPhaseWrites,
  trainerRoadCalendarToSeasonDraft,
  trainerRoadSessionsByWeekStart,
  TrainerRoadSeasonOverlapError,
  type TrainerRoadBikeSession,
  type TrainerRoadSeasonDraft,
  type TrainerRoadSeasonOverlap,
  type TrainerRoadSeasonPhase,
  type TrainerRoadSeasonWindow,
} from "./season";
export { normalizeTrainerRoadIcalUrl, trainerRoadSessionNotes } from "./url";
export {
  disconnectTrainerRoad,
  fetchTrainerRoadIcs,
  refreshTrainerRoadCalendarForAthlete,
  scheduleTrainerRoadRefresh,
  syncTrainerRoadCalendar,
  type TrainerRoadSyncResult,
} from "./sync";
