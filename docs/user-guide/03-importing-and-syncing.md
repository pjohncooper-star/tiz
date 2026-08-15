[← Guide index](./README.md)

# 3. Importing and syncing your training

TiZ gets your completed training from three sources: a one-time bulk import of your history, an ongoing Strava connection, and manual single-file uploads. All three end up in the same place and are scored the same way.

## Bulk historical import

This is onboarding **Step 4**, at `/onboarding/import`.

### Preparing your export

Ask your current platform for a full data export, then **zip the folder** and upload the single `.zip`.

| Supported inside the zip | Notes |
| --- | --- |
| `.fit`, `.tcx`, `.gpx` | The three activity formats |
| `.fit.gz`, `.tcx.gz`, `.gpx.gz` | Gzipped files are decompressed automatically (TrainingPeaks style) |
| Nested `.zip` files | Up to four levels deep, which covers Garmin and Strava bulk exports |
| Loose files and nested folders | Both fine |

The upload itself only accepts `.zip` — a bare `.fit` is rejected with "Please upload a .zip file." (To add one file, use [single-file upload](#single-file-upload) instead.)

Some things inside your export are deliberately ignored: anything under `courses`, `routes`, `workouts`, or `schedules` folders, FIT files that are actually course or workout definitions rather than recorded activities, and macOS `__MACOSX` metadata. Very short stubs with no signal and no distance are also filtered out of activity lists.

### Doing the import

1. Choose an **Export source** label — **Garmin Connect export**, **Strava bulk export**, or **TrainingPeaks export**. This labels the batch for your records; parsing is currently identical for all three.
2. Drag the zip onto **Drag and drop your export zip**, or click to browse.
3. Watch the progress, which refreshes every couple of seconds.

What you'll see, in order:

| State | Meaning |
| --- | --- |
| "Starting import…" with a **Start import now** button | Queued. Press the button if it doesn't move on its own. |
| "Scanning zip — large exports can take a minute…" | Unpacking nested archives and staging individual activity files. |
| A progress bar, "X of Y activities processed (Z skipped)" | Parsing files, fifteen at a time. |
| "All N files parsed… Zone calculation continues in the background." | Parsing done. |
| **Continue to Strava connect** | Safe to move on. |

**Clear upload queue** discards a staged upload if you want to start over.

### What happens in the background

Parsing and scoring are two separate stages, and the second one keeps running after the progress bar fills.

1. **Scan** — the zip is unpacked and each activity file staged.
2. **Parse** — files are read in chunks of fifteen. FIT files yield multisport sessions, swim laps and lengths, the device's own "how did that feel" answers, and the UTC offset. TCX and GPX yield one activity each.
3. **Persist** — each activity is saved, or merged into an existing one if it looks like a duplicate (see [deduplication](#duplicate-detection)).
4. **Score** — zones and training load are computed in batches of twenty-five.

For a large multi-year export, parsing takes minutes and scoring can take considerably longer. Until an activity is scored, it will show up in lists but without a zone breakdown.

### "Skipped" files

The count labelled *skipped* means the file produced no activity — it was corrupt, it was a course or workout template rather than a recording, it was an unsupported sport, or it was empty. Skipped files are not retried. A non-zero skip count on a Garmin export is normal.

### Recovering from a stuck import

| Symptom | What to do |
| --- | --- |
| Stuck on "Starting import…" | Press **Start import now**. |
| Parsing finished but the page still says processing | Press **Continue to Strava connect** — it finalizes the job. |
| Status is failed | Read the error shown, fix the zip, **Clear upload queue**, and upload again. |
| Everything imported but zones never appear | Reaching the complete state triggers a zone backfill automatically. If it is genuinely stuck, an administrator can re-trigger it — see [chapter 12](./12-configuration.md). |
| Upload rejected as too large | Split the export by year and import each separately. |

## Single-file upload

Two places let you upload one activity file — `.fit`, `.gpx`, `.tcx`, or their `.gz` forms — with no zip needed:

- The **Upload** button in the **Planning calendar** toolbar.
- The upload button on a **planned session's page** (`/workouts/{id}`). This one is better, because it passes the session's scheduled date along, so the file links to that day's planned session even if the recording's own date is ambiguous.

After upload, the file is parsed, saved, **scored immediately** (not deferred like bulk import), and auto-linked to a matching planned session if one exists.

## Strava

### Connecting

From **Settings → Integrations**, or onboarding Step 5, press **Connect Strava** and approve access. TiZ requests read access to your activities.

On success:

- Your **last 30 activities** sync right away.
- Onboarding is marked complete if it wasn't already.
- New activities from then on arrive automatically.

### What syncs

For each activity TiZ pulls the name, type, start time, moving duration, distance, and the data streams it needs — time, power, heart rate, smoothed velocity, cadence, and distance — plus the lap list for swims and the UTC offset when Strava provides one.

Activity types are mapped to three disciplines:

| Discipline | Strava types |
| --- | --- |
| Bike | Ride, VirtualRide, EBikeRide, GravelRide |
| Run | Run, TrailRun, VirtualRun |
| Swim | Swim |

Anything else — walks, hikes, yoga, weights — is **skipped**. If you want strength sessions in TiZ, add them as planned sessions and mark them complete manually.

### Ongoing sync

Strava notifies TiZ when you upload a new activity; TiZ queues a background job that fetches it, saves it, links it to a planned session if one matches, and scores it. In practice a new activity shows up within seconds to a couple of minutes.

**Known limitations, worth knowing before they surprise you:**

- Only **new activity** notifications are handled. If you **rename, edit, or delete** an activity on Strava afterwards, TiZ does not follow that change. Fix it in TiZ directly, or delete and re-add.
- The initial sync is **30 activities**, not your whole history. Your history comes from the bulk import.
- There is **no disconnect button** in Settings. Reconnecting overwrites the stored tokens, which covers the usual "it broke, reconnect it" case; a genuine disconnect needs an administrator.
- Open-water swims sometimes arrive without usable lap data, which affects swim zone scoring. There is an administrator script to backfill Strava swim laps.
- Connecting from `localhost` is impossible — Strava will not accept it as a callback domain. Use a deployed URL or an HTTPS tunnel.

For server-side setup (registering the webhook, environment variables), see [chapter 12](./12-configuration.md).

## Duplicate detection

If you bulk-import your history *and* connect Strava, the same workout arrives twice. TiZ recognizes this. When saving an activity it looks for an existing match:

1. Same **external ID** (the Strava activity ID).
2. A **fuzzy match**: same sport, start time within two minutes, duration within 90 seconds or 3%, and distance within 2%.
3. A **fingerprint** built from sport, start time truncated to the minute, duration, and rounded distance.

On a match, the two are merged rather than duplicated: the richer data wins, and zones are recomputed if the new copy brought stream data the old one lacked.

If duplicates slip through anyway — the usual cause is an overlap wider than the fuzzy window — an administrator can run a dedup pass that keeps the best copy, repoints your self-evaluations and planned-session links at it, and deletes the rest.

## Linking activities to planned sessions

A completed activity is linked to the planned session it fulfils. Linking is what turns "3 hours planned" into "3 hours planned, 2:51 done" and what feeds completed-vs-planned shading on the calendar.

**Automatic linking** happens on import, on Strava sync, and on single-file upload. It requires:

- Session planning enabled,
- the same **discipline**,
- the same **calendar day** (or the scheduled date you supplied via a session-page upload),
- and a planned session on that day that isn't already linked.

If several planned sessions on that day match, the earliest-created one wins.

**Manual linking** on the calendar: drag the activity card onto the planned session card. The session card shows "Drop to link workout" as you drag over it.

**Unlinking:** open the session and press **Unlink activity**.

| If this happens | Do this |
| --- | --- |
| Linked to the wrong session (two runs on one day) | Unlink, then drag the right activity onto the right session. |
| Activity landed on the wrong calendar day | Upload from the session page instead, which forces the date. |
| Sport mismatch prevents linking | Change the planned session's discipline, or link a different activity. |

## Background jobs

Several things happen asynchronously. Knowing they exist saves you from thinking the app is broken:

| Job | Triggered by | What you see |
| --- | --- | --- |
| Import batch processing | Uploading a zip | The import progress bar |
| Zone and load computation | Any new or changed activity | Zone tables and charts filling in |
| Zone recomputation over a range | Changing thresholds or signal preferences | Historical zone data shifting |
| Strava activity sync | A Strava webhook | New activities appearing |
| Workout Signaling insights | Pressing **Regenerate insights**, or saving day flags | The insights list changing |

If an activity shows no zone data at all and never gets any, either it has no usable signal (a GPS-less treadmill run with no heart-rate strap, for example) or a background job failed. See [chapter 10](./10-troubleshooting.md).

## Dates, travel, and DST

TiZ works out "today" from your browser's timezone, falling back to a header from the hosting platform, and finally to UTC. It never uses the server's clock.

An individual activity's calendar day comes from its start time plus the UTC offset recorded in the file. When a file carries no offset, the UTC day is used.

**What this means in practice:** a late-evening workout, or one recorded while travelling with a device that didn't store an offset, may land on a different calendar day in TiZ than on your watch. If that puts it on the wrong day for linking, upload it from the planned session's page so the intended date is used.

---

Next: [4. Dashboard and workout analysis →](./04-dashboard-and-analysis.md)
