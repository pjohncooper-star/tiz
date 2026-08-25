import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TR_EASY_IF_MAX,
  TR_INTENSITY_IF_MIN,
  durationMinutesFromTssIf,
  inferTrainerRoadSessionRole,
  isTrainerRoadPhaseMarker,
  matchTrainerRoadPhaseSummary,
  parseIcsEvents,
  parseTrainerRoadCalendar,
  parseTrainerRoadDurationMinutes,
  parseTrainerRoadIntensityFactor,
  trainerRoadDescriptionForcesIntensity,
  trainerRoadMarkersToSeasonPhases,
  trainerRoadCalendarToSeasonDraft,
  mergeTrainerRoadPhaseWrites,
  applyTrainerRoadBikeWeekTarget,
  TrainerRoadSeasonOverlapError,
  trainerRoadTitleWithoutDuration,
  normalizeTrainerRoadIcalUrl,
  trainerRoadSessionNotes,
} from "./index";

describe("TrainerRoad intensity mapping", () => {
  it("locks IF cutoffs at 0.60 / 0.80", () => {
    assert.equal(TR_EASY_IF_MAX, 0.6);
    assert.equal(TR_INTENSITY_IF_MIN, 0.8);
  });

  it("maps IF to Easy / Moderate / Intensity without using the title", () => {
    const easy = inferTrainerRoadSessionRole({
      intensityFactor: 0.45,
      durationMinutes: 60,
      tss: 20,
      description: "TSS 20, IF 0.45. Description: Lazy Mountain -1 is easy endurance.",
    });
    const stillEasy = inferTrainerRoadSessionRole({
      intensityFactor: 0.57,
      durationMinutes: 75,
      tss: 41,
      description: "TSS 41, IF 0.57. Aerobic Endurance.",
    });
    const moderate = inferTrainerRoadSessionRole({
      intensityFactor: 0.6,
      durationMinutes: 60,
      tss: 50,
      description: "TSS 50, IF 0.60. Endurance.",
    });
    const highEndurance = inferTrainerRoadSessionRole({
      intensityFactor: 0.79,
      durationMinutes: 60,
      tss: 63,
      description: "TSS 63, IF 0.79. Endurance intervals.",
    });
    const intensity = inferTrainerRoadSessionRole({
      intensityFactor: 0.8,
      durationMinutes: 60,
      tss: 64,
      description: "TSS 64, IF 0.80.",
    });
    assert.equal(easy, "EASY");
    assert.equal(stillEasy, "EASY");
    assert.equal(moderate, "MODERATE");
    assert.equal(highEndurance, "MODERATE");
    assert.equal(intensity, "INTENSITY");
  });

  it("does not treat mountain titles like Clouds Rest as Easy", () => {
    const role = inferTrainerRoadSessionRole({
      intensityFactor: 0.86,
      durationMinutes: 60,
      tss: 74,
      description: "TSS 74, IF 0.86. Sweet Spot intervals at 90% FTP.",
    });
    assert.equal(role, "INTENSITY");
    assert.equal(trainerRoadTitleWithoutDuration("1:00 - Clouds Rest -1"), "Clouds Rest -1");
  });

  it("forces Intensity from DESCRIPTION quality-zone words even when IF is 0.77–0.79", () => {
    assert.equal(
      inferTrainerRoadSessionRole({
        intensityFactor: 0.78,
        durationMinutes: 60,
        tss: 61,
        description: "TSS 61, IF 0.78. 4x4 minutes at 106% FTP. Goals: VO2 work.",
      }),
      "INTENSITY"
    );
    assert.equal(
      inferTrainerRoadSessionRole({
        intensityFactor: 0.79,
        durationMinutes: 60,
        tss: 63,
        description: "Over-under intervals at Sweet Spot and Threshold.",
      }),
      "INTENSITY"
    );
  });

  it("does not force Intensity from Functional Threshold Power copy", () => {
    assert.equal(
      trainerRoadDescriptionForcesIntensity(
        "Ride at 65% of Functional Threshold Power for aerobic endurance."
      ),
      false
    );
    assert.equal(
      inferTrainerRoadSessionRole({
        intensityFactor: 0.57,
        durationMinutes: 75,
        tss: 41,
        description: "TSS 41, IF 0.57. 65% of Functional Threshold Power. Aerobic Endurance.",
      }),
      "EASY"
    );
  });

  it("maps long moderate rides to Long, but quality work stays Intensity", () => {
    assert.equal(
      inferTrainerRoadSessionRole({
        intensityFactor: 0.7,
        durationMinutes: 180,
        tss: 147,
        description: "TSS 147, IF 0.70. Endurance ride.",
      }),
      "LONG"
    );
    assert.equal(
      inferTrainerRoadSessionRole({
        intensityFactor: 0.85,
        durationMinutes: 180,
        tss: 216,
        description: "TSS 216, IF 0.85. Sweet Spot.",
      }),
      "INTENSITY"
    );
  });

  it("treats TSS-only races (no IF) as Intensity stubs", () => {
    assert.equal(
      inferTrainerRoadSessionRole({
        intensityFactor: null,
        durationMinutes: 240,
        tss: 350,
        description: "TSS 350. Description: Aquabike worlds",
      }),
      "INTENSITY"
    );
  });

  it("parses duration, IF with a trailing period, and TSS/IF fallback minutes", () => {
    assert.equal(parseTrainerRoadDurationMinutes("1:00 - Eichorn"), 60);
    assert.equal(parseTrainerRoadDurationMinutes("1:30 - Tray Mountain"), 90);
    assert.equal(parseTrainerRoadDurationMinutes("0:45 - Red Slate -5"), 45);
    assert.equal(parseTrainerRoadDurationMinutes("4:00 - Aquabike worlds"), 240);
    assert.equal(parseTrainerRoadDurationMinutes("Base 1"), null);
    assert.equal(parseTrainerRoadIntensityFactor("TSS 71, IF 0.84. Power Based"), 0.84);
    assert.equal(durationMinutesFromTssIf(100, 1), 60);
  });
});

describe("TrainerRoad phase markers", () => {
  it("maps Base / Build / Specialty / Rest Week aliases", () => {
    assert.deepEqual(matchTrainerRoadPhaseSummary("Base 1"), {
      name: "Base 1",
      phaseKind: "BASE",
    });
    assert.deepEqual(matchTrainerRoadPhaseSummary("Build"), {
      name: "Build",
      phaseKind: "BUILD",
    });
    assert.deepEqual(matchTrainerRoadPhaseSummary("Specialty"), {
      name: "Specialty",
      phaseKind: "RACE_PREP",
    });
    assert.deepEqual(matchTrainerRoadPhaseSummary("Speciality"), {
      name: "Specialty",
      phaseKind: "RACE_PREP",
    });
    assert.deepEqual(matchTrainerRoadPhaseSummary("Recovery Week"), {
      name: "Rest Week",
      phaseKind: "TAPER",
    });
    assert.deepEqual(matchTrainerRoadPhaseSummary("Rest Week"), {
      name: "Rest Week",
      phaseKind: "TAPER",
    });
    assert.equal(isTrainerRoadPhaseMarker("Aquabike worlds"), false);
    assert.equal(isTrainerRoadPhaseMarker("1:00 - Eichorn"), false);
  });

  it("builds the Patrick calendar as nine phases with Rest Week last", () => {
    const phases = trainerRoadMarkersToSeasonPhases(
      [
        { dateKey: "2026-08-24", summary: "Base 1", weekStartDate: "2026-08-24" },
        { dateKey: "2026-09-21", summary: "Base 2", weekStartDate: "2026-09-21" },
        { dateKey: "2026-10-19", summary: "Base 3", weekStartDate: "2026-10-19" },
        { dateKey: "2026-11-16", summary: "Build", weekStartDate: "2026-11-16" },
        { dateKey: "2027-01-11", summary: "Specialty", weekStartDate: "2027-01-11" },
        { dateKey: "2027-03-08", summary: "Base 1", weekStartDate: "2027-03-08" },
        { dateKey: "2027-04-05", summary: "Build", weekStartDate: "2027-04-05" },
        { dateKey: "2027-05-31", summary: "Specialty", weekStartDate: "2027-05-31" },
        { dateKey: "2027-07-26", summary: "Recovery Week", weekStartDate: "2027-07-26" },
      ],
      { lastWorkoutDateKey: "2027-07-31", seasonEndDateKey: "2027-07-31" }
    );

    assert.deepEqual(
      phases.map((p) => ({ name: p.name, weeks: p.weekCount, kind: p.phaseKind })),
      [
        { name: "Base 1", weeks: 4, kind: "BASE" },
        { name: "Base 2", weeks: 4, kind: "BASE" },
        { name: "Base 3", weeks: 4, kind: "BASE" },
        { name: "Build", weeks: 8, kind: "BUILD" },
        { name: "Specialty", weeks: 8, kind: "RACE_PREP" },
        { name: "Base 1", weeks: 4, kind: "BASE" },
        { name: "Build", weeks: 8, kind: "BUILD" },
        { name: "Specialty", weeks: 8, kind: "RACE_PREP" },
        { name: "Rest Week", weeks: 1, kind: "TAPER" },
      ]
    );
  });

  it("snaps a non-Monday marker back to that week's Monday", () => {
    const phases = trainerRoadMarkersToSeasonPhases([
      { dateKey: "2026-08-26", summary: "Base 1", weekStartDate: "2026-08-26" },
      { dateKey: "2026-09-21", summary: "Build", weekStartDate: "2026-09-21" },
    ]);
    assert.equal(phases[0]!.weekCount, 4);
    assert.equal(phases[0]!.name, "Base 1");
  });
});

describe("TrainerRoad ICS calendar parse", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "X-WR-CALNAME:Patrick TrainerRoad Calendar",
    "BEGIN:VEVENT",
    "UID:easy-1",
    "DTSTART;VALUE=DATE:20260811",
    "SUMMARY:1:15 - Capulin",
    "DESCRIPTION:TSS 41, IF 0.57. Aerobic Endurance workouts.",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:ss-1",
    "DTSTART;VALUE=DATE:20260824",
    "SUMMARY:1:00 - Eichorn",
    "DESCRIPTION:TSS 69, IF 0.83, kJ(Cal) 668. Sweet Spot intervals at 90% FTP.",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:vo2-low-if",
    "DTSTART;VALUE=DATE:20261214",
    "SUMMARY:1:00 - Solferino",
    "DESCRIPTION:TSS 61, IF 0.78. 4x4-minute intervals at 106% FTP. Goals: VO2.",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:false-rest",
    "DTSTART;VALUE=DATE:20260918",
    "SUMMARY:1:00 - Clouds Rest -1",
    "DESCRIPTION:TSS 74, IF 0.86. Sweet Spot.",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:phase-base",
    "DTSTART;VALUE=DATE:20260824",
    "SUMMARY:Base 1",
    "DESCRIPTION:block text",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:blurb",
    "DTSTART;VALUE=DATE:20260824",
    "SUMMARY:Aquabike worlds",
    "DESCRIPTION:Your custom plan is built to give you the best possible training.",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:race-a",
    "DTSTART;VALUE=DATE:20270725",
    "SUMMARY:4:00 - Aquabike worlds",
    "DESCRIPTION:TSS 350. Description: Aquabike worlds",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:race-b",
    "DTSTART;VALUE=DATE:20270725",
    "SUMMARY:4:00 - Aquabike worlds",
    "DESCRIPTION:Description: Aquabike worlds",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:rest",
    "DTSTART;VALUE=DATE:20270726",
    "SUMMARY:Recovery Week",
    "DESCRIPTION:block text",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:folded",
    "DTSTART;VALUE=DATE:20260806",
    "SUMMARY:1:00 - Steamboat +2",
    "DESCRIPTION:TSS 71, IF 0.84.",
    "  Power Based Description: Warm Up",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("unfolds folded DESCRIPTION lines", () => {
    const events = parseIcsEvents(ics);
    const steamboat = events.find((e) => e.uid === "folded");
    assert.match(steamboat?.description ?? "", /Power Based Description/);
  });

  it("imports duration-prefixed bike workouts and skips phase/goal blurbs", () => {
    const parsed = parseTrainerRoadCalendar(ics);
    const titles = parsed.workouts.map((w) => w.title);
    assert.ok(titles.includes("Capulin"));
    assert.ok(titles.includes("Eichorn"));
    assert.ok(!titles.includes("Base 1"));
    assert.equal(titles.filter((t) => t === "Aquabike worlds").length, 1);

    const capulin = parsed.workouts.find((w) => w.title === "Capulin")!;
    assert.equal(capulin.durationMinutes, 75);
    assert.equal(capulin.sessionRole, "EASY");

    const eichorn = parsed.workouts.find((w) => w.title === "Eichorn")!;
    assert.equal(eichorn.sessionRole, "INTENSITY");

    const solferino = parsed.workouts.find((w) => w.title === "Solferino")!;
    assert.equal(solferino.sessionRole, "INTENSITY");

    const cloudsRest = parsed.workouts.find((w) => w.title === "Clouds Rest -1")!;
    assert.equal(cloudsRest.sessionRole, "INTENSITY");

    const race = parsed.workouts.find((w) => w.title === "Aquabike worlds")!;
    assert.equal(race.durationMinutes, 240);
    assert.equal(race.sessionRole, "INTENSITY");
    assert.equal(race.tss, 350);

    assert.deepEqual(
      parsed.phaseMarkers.map((m) => m.summary),
      ["Base 1", "Recovery Week"]
    );
    assert.equal(parsed.calendarName, "Patrick TrainerRoad Calendar");
  });
});

describe("TrainerRoad iCal URL", () => {
  it("normalizes webcal and :80 to https TrainerRoad hosts", () => {
    assert.equal(
      normalizeTrainerRoadIcalUrl(
        "webcal://api.trainerroad.com:80/v1/calendar/ics/abc"
      ),
      "https://api.trainerroad.com/v1/calendar/ics/abc"
    );
  });

  it("rejects empty and non-TrainerRoad hosts", () => {
    assert.equal(normalizeTrainerRoadIcalUrl(""), null);
    assert.equal(normalizeTrainerRoadIcalUrl("https://evil.example/ics"), null);
  });

  it("formats IF and TSS into session notes", () => {
    assert.equal(
      trainerRoadSessionNotes({ intensityFactor: 0.83, tss: 69 }),
      "IF 0.83 · TSS 69"
    );
    assert.equal(
      trainerRoadSessionNotes({ intensityFactor: null, tss: null }),
      null
    );
  });
});

const PATRICK_MARKERS = [
  { dateKey: "2026-08-24", summary: "Base 1", weekStartDate: "2026-08-24" },
  { dateKey: "2026-09-21", summary: "Base 2", weekStartDate: "2026-09-21" },
  { dateKey: "2026-10-19", summary: "Base 3", weekStartDate: "2026-10-19" },
  { dateKey: "2026-11-16", summary: "Build", weekStartDate: "2026-11-16" },
  { dateKey: "2027-01-11", summary: "Specialty", weekStartDate: "2027-01-11" },
  { dateKey: "2027-03-08", summary: "Base 1", weekStartDate: "2027-03-08" },
  { dateKey: "2027-04-05", summary: "Build", weekStartDate: "2027-04-05" },
  { dateKey: "2027-05-31", summary: "Specialty", weekStartDate: "2027-05-31" },
  { dateKey: "2027-07-26", summary: "Recovery Week", weekStartDate: "2027-07-26" },
];

describe("TrainerRoad-driven season", () => {
  it("drafts nine phases with Rest Week last and bike ramp off", () => {
    const draft = trainerRoadCalendarToSeasonDraft({
      calendarName: "Patrick TrainerRoad Calendar",
      phaseMarkers: PATRICK_MARKERS,
      workouts: [
        {
          uid: "race",
          dateKey: "2027-07-25",
          title: "Aquabike worlds",
          durationMinutes: 240,
          tss: 350,
          intensityFactor: null,
          sessionRole: "INTENSITY",
          description: "",
        },
        {
          uid: "last",
          dateKey: "2027-07-31",
          title: "Easy",
          durationMinutes: 60,
          tss: 20,
          intensityFactor: 0.5,
          sessionRole: "EASY",
          description: "",
        },
      ],
    });
    assert.ok(draft);
    assert.equal(draft!.name, "Patrick TrainerRoad Calendar");
    assert.equal(draft!.startDateKey, "2026-08-24");
    assert.equal(draft!.endDateKey, "2027-08-01");
    assert.deepEqual(
      draft!.phases.map((p) => ({
        name: p.name,
        weeks: p.endWeekIndex - p.startWeekIndex + 1,
        kind: p.phaseKind,
        bikeRamp: p.rampEnabled.bike,
        bikeSessions: p.bikeSessionsPerWeek,
      })),
      [
        { name: "Base 1", weeks: 4, kind: "BASE", bikeRamp: false, bikeSessions: 0 },
        { name: "Base 2", weeks: 4, kind: "BASE", bikeRamp: false, bikeSessions: 0 },
        { name: "Base 3", weeks: 4, kind: "BASE", bikeRamp: false, bikeSessions: 0 },
        { name: "Build", weeks: 8, kind: "BUILD", bikeRamp: false, bikeSessions: 0 },
        { name: "Specialty", weeks: 8, kind: "RACE_PREP", bikeRamp: false, bikeSessions: 0 },
        { name: "Base 1", weeks: 4, kind: "BASE", bikeRamp: false, bikeSessions: 0 },
        { name: "Build", weeks: 8, kind: "BUILD", bikeRamp: false, bikeSessions: 0 },
        { name: "Specialty", weeks: 8, kind: "RACE_PREP", bikeRamp: false, bikeSessions: 0 },
        { name: "Rest Week", weeks: 1, kind: "TAPER", bikeRamp: false, bikeSessions: 0 },
      ]
    );
    const specialty = draft!.phases.filter((p) => p.name === "Specialty");
    assert.equal(specialty.length, 2);
    assert.equal(specialty[1]!.endWeekIndex + 1, draft!.phases.at(-1)!.startWeekIndex);
  });

  it("returns null when the feed has no phase markers", () => {
    assert.equal(
      trainerRoadCalendarToSeasonDraft({
        calendarName: null,
        phaseMarkers: [],
        workouts: [],
      }),
      null
    );
  });

  it("lists overlapping seasons without creating a row", () => {
    const error = new TrainerRoadSeasonOverlapError([
      { id: "s1", name: "2026 season", startDate: "2026-01-05", endDate: "2026-12-27" },
    ]);
    assert.match(error.message, /2026 season/);
    assert.equal(error.overlapping.length, 1);
  });

  it("preserves swim/run fields from the overlapping prior phase on re-sync", () => {
    const incoming = trainerRoadCalendarToSeasonDraft({
      calendarName: "TrainerRoad",
      phaseMarkers: PATRICK_MARKERS,
      workouts: [{ uid: "w", dateKey: "2027-07-31", title: "Easy", durationMinutes: 60, tss: 20, intensityFactor: 0.5, sessionRole: "EASY", description: "" }],
    })!.phases;
    const existing = incoming.map((phase, index) =>
      index === 0
        ? {
            ...phase,
            id: "keep-base-1",
            swimSessionsPerWeek: 5,
            swimStartHours: 3.5,
            weeklyTemplateId: "tmpl-swim-run",
            rampEnabled: { swim: false, bike: true, run: true },
          }
        : phase
    );
    const merged = mergeTrainerRoadPhaseWrites(incoming, existing);
    assert.equal(merged[0]!.id, "keep-base-1");
    assert.equal(merged[0]!.swimSessionsPerWeek, 5);
    assert.equal(merged[0]!.swimStartHours, 3.5);
    assert.equal(merged[0]!.weeklyTemplateId, "tmpl-swim-run");
    assert.equal(merged[0]!.rampEnabled.swim, false);
    assert.equal(merged[0]!.rampEnabled.bike, false);
    assert.equal(merged[0]!.bikeSessionsPerWeek, 0);
  });

  it("sets bike week targets from TrainerRoad session duration and zones", () => {
    const target = applyTrainerRoadBikeWeekTarget(
      {
        weekStart: "2026-08-24",
        weekIndex: 0,
        isRestWeek: false,
        totalHours: 8,
        phase: { name: "Base 1", color: "#38bdf8" },
        strengthSessionsPerWeek: 0,
        byDiscipline: [
          { discipline: "SWIM", hours: 2, zoneMinutes: { "SWIM-2": 60 }, sessionsPerWeek: 3, intenseDaysPerWeek: 1 },
          { discipline: "BIKE", hours: 5, zoneMinutes: { "BIKE-2": 99 }, sessionsPerWeek: 4, intenseDaysPerWeek: 2 },
          { discipline: "RUN", hours: 1.5, zoneMinutes: { "RUN-2": 40 }, sessionsPerWeek: 3, intenseDaysPerWeek: 1 },
        ],
        zoneMinutes: { "SWIM-2": 60, "BIKE-2": 99, "RUN-2": 40 },
        slotBudgets: {
          SWIM: { endurance: 2, intensity: 1, long: 0, substituteEndurance: 0, substituteDurationMinutes: 0 },
          BIKE: { endurance: 2, intensity: 1, long: 1, substituteEndurance: 0, substituteDurationMinutes: 0 },
          RUN: { endurance: 2, intensity: 1, long: 0, substituteEndurance: 0, substituteDurationMinutes: 0 },
        },
      },
      [
        {
          dateKey: "2026-08-24",
          durationMinutes: 60,
          targetZones: { "BIKE-2": 40, "BIKE-4": 20 },
          sessionRole: "INTENSITY",
        },
        {
          dateKey: "2026-08-26",
          durationMinutes: 90,
          targetZones: { "BIKE-2": 90 },
          sessionRole: "MODERATE",
        },
        {
          dateKey: "2026-08-31",
          durationMinutes: 120,
          sessionRole: "LONG",
        },
      ]
    );
    const bike = target.byDiscipline.find((row) => row.discipline === "BIKE")!;
    assert.equal(bike.hours, 2.5);
    assert.equal(bike.sessionsPerWeek, 2);
    assert.equal(bike.intenseDaysPerWeek, 1);
    assert.deepEqual(bike.zoneMinutes, { "BIKE-2": 130, "BIKE-4": 20 });
    assert.equal(target.byDiscipline.find((row) => row.discipline === "SWIM")!.hours, 2);
    assert.equal(target.totalHours, 6);
    assert.equal(target.slotBudgets?.BIKE.endurance, 0);
    assert.equal(target.zoneMinutes["SWIM-2"], 60);
  });
});
