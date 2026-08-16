# TiZ User Guide

TiZ ("Time in Zone") is a multisport training planner for swim, bike, run, and strength. It combines four things most tools keep separate:

1. **A history of what you actually did** — imported from a Garmin/Strava/TrainingPeaks export and kept current through Strava sync.
2. **A season plan** — phases, weekly volume ramps, de-load weeks, and time-in-zone targets built around your goal races.
3. **A planning calendar** — the week-by-week schedule, where season targets turn into real sessions with structured workouts you can send to your watch.
4. **Analysis** — time in zone, training load, fitness/fatigue, and pattern detection on the days that felt great or terrible.

The organizing idea is **time in zone (TiZ)**: instead of planning "an hour easy," TiZ plans *minutes in Z1–Z5* per sport, and then checks what you actually accumulated against that budget.

## Read this first

If you are new, work through the guide in order. The first three chapters are setup you only do once; the rest you will return to.

| Chapter | Read it when |
| --- | --- |
| [1. Getting started](./01-getting-started.md) | Creating your account and walking through onboarding |
| [2. Thresholds and zones](./02-thresholds-and-zones.md) | Setting FTP, threshold pace, LTHR, and understanding how zones are scored |
| [3. Importing and syncing your training](./03-importing-and-syncing.md) | Bulk-importing history, connecting Strava, uploading single files |
| [4. Dashboard and workout analysis](./04-dashboard-and-analysis.md) | Reviewing what you did — charts, zone tables, self-evaluation |
| [5. The season planner](./05-season-planner.md) | Building a season: races, phases, volume, TiZ targets |
| [6. The planning calendar](./06-planning-calendar.md) | Scheduling weeks, the workout pool, linking activities, device export |
| [7. Workout library and programs](./07-workout-library.md) | Building structured workouts and reusable multi-week programs |
| [8. Workout Signaling](./08-workout-signaling.md) | Finding load patterns behind your good and bad days |
| [9. Settings reference](./09-settings.md) | Changing units, zone focus library, self-eval fields, integrations |
| [10. Troubleshooting](./10-troubleshooting.md) | Something isn't working |
| [11. Glossary](./11-glossary.md) | You hit a term you don't recognize |
| [12. Configuration and administration](./12-configuration.md) | Self-hosting, environment variables, admin scripts |
| [13. Known limitations](./13-known-limitations.md) | Checking whether the thing you're fighting is the app rather than you |

## The five-minute version

1. **Register**, then complete onboarding: your name, current thresholds, optional threshold history, a bulk import of your training history, and a Strava connection.
2. Open the **Dashboard** to confirm your history landed and your zones were computed.
3. Go to **Seasons** and create a season: name it, set start and end dates, add your A-race, then add **phases** (Base, Build, Race prep, Taper) and set volume for each.
4. Save with recalculate. Each week now has an hours target, a TiZ target, and a session budget.
5. Open the **Calendar**, open the **Workout pool**, and drag the week's budgeted sessions onto days. Build structured workouts for the ones that need them.
6. Train. Activities arrive from Strava, auto-link to the planned session on that day, and get scored into zones.
7. Review on the **Dashboard** and on each workout's detail page.

## Navigation

The left sidebar is the whole app:

| Item | What it is |
| --- | --- |
| **Dashboard** | Yesterday/today/tomorrow, the fitness/fatigue chart, and "At a glance" analytics |
| **Calendar** | The planning calendar — scrollable weeks of planned sessions and completed activities |
| **Seasons** | The season planner |
| **Workouts** | The workout library (structured workouts in folders) and programs |
| **Workout Signaling** | Day flags and load-pattern insights |
| **Settings** | Units, thresholds, planning defaults, workout options, integrations |
| **Sign out** | At the bottom of the sidebar |

**Calendar**, **Seasons**, and **Workouts** are feature-flagged. If you don't see them, the server does not have the corresponding flag enabled — see [chapter 12](./12-configuration.md).

## About this guide

It documents behavior that is actually implemented. Where the app has a rough edge or a known gap, the guide says so rather than pretending otherwise; those notes are marked **Known limitation**, and [chapter 13](./13-known-limitations.md) collects all of them in one place.

Some documents elsewhere in `docs/` (notably `plan-wizard-*.md`) describe proposed redesigns that are not built. Treat this guide, not those, as the description of the current app.
