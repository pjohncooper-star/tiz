import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIcalCalendar, buildIcalEvent } from "@/lib/plan/calendar/ical-feed";

describe("buildIcalEvent", () => {
  it("emits all-day event when untimed", () => {
    const event = buildIcalEvent(
      {
        id: "sess1",
        title: "Easy run",
        notes: "Keep it easy",
        discipline: "RUN",
        scheduledDate: "2026-08-12",
        scheduledTimeMinutes: null,
        estimatedDurationMinutes: 45,
      },
      { siteOrigin: "https://www.tizplanner.com" }
    );
    assert.match(event, /DTSTART;VALUE=DATE:20260812/);
    assert.match(event, /DTEND;VALUE=DATE:20260813/);
    assert.match(event, /SUMMARY:Easy run/);
    assert.match(event, /DESCRIPTION:Run\\nKeep it easy/);
  });

  it("emits timed event with duration", () => {
    const event = buildIcalEvent(
      {
        id: "sess2",
        title: "Bike",
        notes: null,
        discipline: "BIKE",
        scheduledDate: "2026-08-12",
        scheduledTimeMinutes: 6 * 60 + 30,
        estimatedDurationMinutes: 90,
      },
      { siteOrigin: "https://www.tizplanner.com" }
    );
    assert.match(event, /DTSTART:20260812T063000/);
    assert.match(event, /DURATION:PT1H30M/);
    assert.match(event, /URL:https:\/\/www\.tizplanner\.com\/workouts\/sess2/);
  });
});

describe("buildIcalCalendar", () => {
  it("wraps events in VCALENDAR", () => {
    const ics = buildIcalCalendar(
      [
        {
          id: "a",
          title: "Swim",
          notes: null,
          discipline: "SWIM",
          scheduledDate: "2026-08-13",
          scheduledTimeMinutes: null,
          estimatedDurationMinutes: null,
        },
      ],
      { siteOrigin: "https://example.com" }
    );
    assert.match(ics, /^BEGIN:VCALENDAR/);
    assert.match(ics, /END:VCALENDAR\r\n$/);
    assert.match(ics, /BEGIN:VEVENT/);
  });
});
