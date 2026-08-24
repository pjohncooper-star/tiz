/** Pure TrainerRoad iCal mappings. Feed fetch, session sync, and season rewrite are not wired. */

export {
  parseIcsEvents,
  unfoldIcsLines,
  type IcsEvent,
} from "./ics";
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
  trainerRoadMarkersToSeasonPhases,
  type TrainerRoadPhaseMarker,
} from "./phases";
export {
  dedupeTrainerRoadWorkouts,
  parseTrainerRoadCalendar,
  type ParsedTrainerRoadCalendar,
  type TrainerRoadWorkout,
} from "./calendar";
