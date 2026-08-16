[← Guide index](./README.md)

# 13. Known limitations

Everything here is a limitation of the app as built, collected in one place so you can check whether the thing you are fighting is your mistake or the app's. Each entry says what happens, why, and what to do instead.

The list is ordered by how much trouble it can cause, starting with the handful of things that can quietly give you wrong numbers.

## Things that can mislead you

These matter most, because nothing visibly fails — the app just tells you something that isn't quite what you think it is.

### Activity dates can land on the wrong day

An activity's calendar day comes from its start time plus the UTC offset recorded in the file. When a file carries no offset, the **UTC day** is used, and parts of the dashboard and calendar group activities by UTC regardless.

A late-evening session, or one recorded while travelling with a device that didn't store an offset, can therefore appear a day off from what your watch says — which also stops it auto-linking to the planned session you meant it for.

**What to do:** upload the file from the planned session's page, which forces the intended date, or link it manually by dragging on the calendar.

### Strava edits and deletions never reach TiZ

Only "new activity" notifications from Strava are handled. Rename an activity, correct its distance, change its type, or delete it on Strava, and TiZ keeps the version it first received, silently and indefinitely.

**What to do:** make corrections in TiZ directly. For a deletion, delete the activity in TiZ too.

### Weekly volume may read lower than your watch

Weekly volume prefers **TiZ minutes** — the sum of Z1 to Z5 — and falls back to recorded duration only where zone data is missing entirely. A session whose data stream was partly invalid contributes fewer zone minutes than its elapsed time, so a week's total can look short without anything being wrong.

### Old activities are mis-scored without threshold history

Zones are computed against the threshold in effect on each activity's date. If you never entered historical thresholds, every activity is scored against your current fitness, and years-old base work will look far easier than it was.

**What to do:** add effective-dated entries under **Settings → Thresholds & paces**. Zones for the affected range recompute in the background.

### Auto-linking picks the earliest session on the day

When two planned sessions of the same sport sit on one day, an arriving activity links to whichever was created first, not to whichever it actually was.

**What to do:** unlink and re-link by dragging on the calendar.

### Duplicate detection has hard edges

Duplicates are merged when the external ID matches, or when start time is within two minutes, duration within 90 seconds or 3%, and distance within 2%. Copies that fall outside those windows — a Strava upload trimmed differently from the original FIT file, say — survive as two activities.

**What to do:** ask an administrator to run the dedup pass, which keeps the richest copy and repoints your self-evaluations and session links at it.

### Workout Signaling findings are fragile

Insights are correlations over a small number of flagged days, sensitive to how consistently you flag and to the sensitivity setting. An insight with `n=4` is a hint. Loosening sensitivity from Standard toward Exploratory produces more findings, most of which are noise.

## No self-service for account and connection changes

| Limitation | Detail | Workaround |
| --- | --- | --- |
| No password reset | There is no "forgot password" flow anywhere in the UI | An administrator runs `npm run user:reset-password` |
| No Strava disconnect | Settings shows connection status and a connect link, nothing else | Reconnecting replaces the stored tokens. A real disconnect needs database access. |
| Onboarding is one-way | Once complete, you cannot re-enter the guided flow | Everything it set is editable under **Settings** |
| Bulk import is effectively onboarding-only | Nothing in the app links to the import page after onboarding | The page still works if you navigate to `/onboarding/import` directly |

## Import and sync coverage

| Limitation | Detail |
| --- | --- |
| Bulk import needs a `.zip` | A loose `.fit`, `.gpx`, or `.tcx` is rejected. Use the calendar's **Upload** button for single files. |
| Nested archives stop at four levels | Deeper nesting is not fully extracted |
| Skipped files are never retried | A file that failed to parse stays skipped; there is no retry list and no per-file report |
| Only ride, run, and swim sync from Strava | Walks, hikes, gym sessions, yoga, and everything else are ignored |
| The initial Strava sync is 30 activities | Your history has to come from the bulk import |
| Open-water swims may arrive without usable laps | Which affects swim zone scoring. An administrator can run the Strava swim-lap backfill. |
| Strava cannot be connected from `localhost` | Strava rejects it as a callback domain. Use a deployed URL or an HTTPS tunnel. |
| Zone computation has no progress indicator | After a large import, activities appear before their zone data does, with nothing showing how far along the backfill is |

## Implemented in the API but not in the UI

These all work server-side; there is simply no control for them.

| Missing control | Consequence |
| --- | --- |
| Rename a workout folder | Choose folder names carefully the first time |
| Move a folder, or move a workout between folders | A misfiled workout has to be rebuilt in the right folder |
| Drag-reorder program sessions | Reposition them by editing the **Day offset** field |
| Edit a week's targets on the calendar | Targets come from the season plan only |
| Goal times per race in the season planner | The field exists on the model and drives calendar race durations. Set a goal time when creating a race directly on the calendar instead. |
| Plan adherence analytics | Applied sessions are stamped with their program session, but nothing surfaces the comparison |

## Prescription and export gaps

| Limitation | Detail |
| --- | --- |
| RPE cannot be a step target | RPE exists only in post-workout self-evaluation. Prescribe zones or paces instead. |
| Percent-of-FTP and open-duration targets are CSV-only | The visual step editor offers zones, absolute values, relative pace, and relative HR (LTHR or max). Percent-of-FTP and open-duration steps still only come in through CSV import |
| Export is only from a planned session | A library workout cannot be exported directly — attach it to a calendar day first |
| ZWO export is limited | Time-based steps mapped to power fractions, no step notes, and swim-specific structure does not translate |
| Tags apply to planned sessions, not library workouts | There is no way to tag or search the library itself; organization is by folder only |
| A program cannot start empty | Programs come from a CSV import or from capturing a calendar range; there is no blank-program button |
| Programs cap at 500 sessions and 182 days | Which is 26 weeks — long enough for most blocks, not for a whole year |
| Library and calendar do not stay in sync | Editing a program does not change weeks already applied, and editing a calendar session does not update the library program |

## Screen size and interaction

| Limitation | Detail |
| --- | --- |
| The workout pool is desktop-only | It closes below 768px, and the full builder needs an extra-large viewport. There is no mobile equivalent. |
| The month picker is desktop-only | Narrow screens have **Today** and **Jump to** only |
| No multi-select on the calendar | Sessions are moved, deleted, and edited one at a time |
| Timed sessions cannot be hand-reordered | Sessions with a start time are ordered by that time. Clear the start time to order a day manually. |

## Analysis gaps

| Limitation | Detail |
| --- | --- |
| There is no activity list page | History is browsed through the calendar and its search pane. Opening an activity URL redirects to its session page. |
| Mean-maximal curves are dashboard-only | You can see your best 5-minute power for a date range, but not for a single ride |
| Swim has no execution stream chart | Swims get a lap pace chart instead |
| The planned-versus-actual overlay needs all three of: a bike or run stream, a structured workout, and matching device lap data | Without them you get a plain stream chart |

## Planner constraints

| Limitation | Detail |
| --- | --- |
| Generating sessions requires a weekly template | A phase must also be assigned to weeks. Without both, **Generate sessions** refuses. |
| Week shifting is unavailable inside a season | The **Shift** menu is hidden for weeks with season targets; adjust the plan instead |
| Seasons cannot overlap | Archive or re-date the other season first |
| Mesocycles are not directly editable | They are derived four-week blocks; you influence them through phase length and rest weeks |
| De-load weeks cut volume only | Rest weeks reduce volume without shifting the intensity distribution |

## Gates and flags

| Limitation | Detail |
| --- | --- |
| Sidebar items depend on server flags | **Calendar**, **Seasons**, and **Workouts** each require a feature flag. A missing item means the server does not have it enabled — see [chapter 12](./12-configuration.md). |
| Workout Signaling needs nine months of history | And at least three good-or-great plus three rough-or-bad flagged workouts before it will generate anything |
| Turning off ECO deletes ECO insights | They are regenerated only if you turn ECO back on and regenerate |

## Documents that describe features that do not exist

Worth knowing if you read the rest of `docs/`, because several documents describe intent rather than the app:

| Document | Status |
| --- | --- |
| `docs/relative-pace-targets.md` | Shipped. Bare `80%` HR is LTHR; `80%\|max` is athlete max HR |
| `docs/calendar-workout-pool-v2.md` | Partly shipped. The suggested-intervals sidebar, dragging library folders inside the pool, and the role picker on drop are not built; roles come from the slot type automatically. |
| `docs/workout-pool-wizard-wireframe.md` | Largely shipped on wide screens, but the separate skeleton/build tabs, the role picker, and the mobile version are not |
| `docs/plan-wizard-screen-spec.md`, `plan-wizard-implementation-plan.md`, `plan-wizard-pain-points.md` | Proposals for a planner redesign. None of it is built. |
| `docs/plan-wizard-weekly-template-strategy.md` | Applying a weekly template is shipped; season-owned phase layout materialization as described is not |

---

[← Guide index](./README.md)
