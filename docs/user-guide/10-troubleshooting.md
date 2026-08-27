[← Guide index](./README.md)

# 10. Troubleshooting

## Sign-in and access

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Invalid email or password" | Wrong credentials | Passwords are at least 8 characters. Use **Forgot password?** on `/login`. An administrator can still reset it with the `user:reset-password` script. |
| Reset email never arrives | Email is not configured, or the address does not match an account | Check spam. Production needs `RESEND_API_KEY` and `EMAIL_FROM`. The page always says a link was sent, even when no account matches. |
| "Email taken" on register | An account already exists | Sign in instead. |
| Registering didn't log me in | By design | Registration sends you to the sign-in page; sign in with the credentials you just made. |
| I can't get back into onboarding | By design | Onboarding is one-way. Everything it set is editable under **Settings**. |
| **Calendar**, **Seasons**, or **Workouts** missing from the sidebar | The corresponding feature flag isn't enabled on the server | See [chapter 12](./12-configuration.md). |

## Import

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Please upload a .zip file." | You uploaded a loose `.fit`, `.gpx`, or `.tcx` | Zip the export folder first, or use the calendar's **Upload** button for a single file. |
| No activity files found | The zip has no supported files, or they are nested more than four levels deep | Check the archive contents; flatten deeply nested archives. |
| Upload rejected as too large | The file exceeds the server's body limit | Split the export by year and import each. |
| Stuck on "Scanning zip" or "Starting import…" | The background scan hasn't started | Press **Start import now**. If it still doesn't move, **Clear upload queue** and retry. |
| Parsing finished but the page still shows processing | The job hasn't been finalized | Press **Continue to Strava connect**, which finalizes it. |
| Import failed | Corrupt or empty archive | Read the error message, fix the zip, **Clear upload queue**, upload again. |
| Some files were skipped | They produced no activity — courses, workout templates, unsupported sports, or corrupt files | Usually expected. Spot-check a few key activities to confirm they arrived. |
| Everything imported but no zone data | Zone computation runs after parsing and takes a while on large imports | Wait. Reaching the complete state triggers a backfill automatically; an administrator can re-trigger it. |
| Import works locally but not in production | Background job processing isn't configured | An administrator needs to check the Inngest keys — see [chapter 12](./12-configuration.md). |

## Zones and thresholds

| Symptom | Cause | Fix |
| --- | --- | --- |
| An activity has no zone breakdown at all | No usable signal — no power, no heart rate, no velocity — or the stream is more than 20% invalid | Nothing to fix if the data isn't there. A treadmill run with no heart-rate strap genuinely has nothing to score. |
| The zone table says **(fallback)** | Your primary signal was unusable, so the other one was used | Expected behavior. Check whether your power meter or GPS dropped out. |
| Old activities look far too easy | They were scored against your current, fitter thresholds | Add threshold history entries in **Settings → Thresholds & paces**. Zones for the affected range recompute in the background. |
| Zone ranges look wrong for the effort | Threshold values or cutoffs are off | Check the threshold value first, then **Edit zone boundaries**. The editor shows what each cutoff works out to in watts, bpm, or pace. |
| I changed my FTP and the numbers didn't move | Recomputation runs in the background | Give it time, then reload. |
| Swim has no zone data | No usable lap or velocity data | Check that your swim threshold pace is set. For Strava open-water swims, an administrator can run the swim-lap backfill. |
| "Zone cutoffs must be strictly increasing" | A cutoff is equal to or lower than the one before it | Each cutoff must be higher than the previous. |

## Strava

| Symptom | Cause | Fix |
| --- | --- | --- |
| Connect fails on a local server | Strava does not allow `localhost` as a callback domain | Use a deployed URL, or put an HTTPS tunnel in front and register that domain with the Strava app. |
| Connect redirects with an error | The app's public URL doesn't match the Strava app's authorization callback domain | An administrator must align them exactly — see [chapter 12](./12-configuration.md). |
| New activities don't appear | The webhook isn't registered, or the endpoint isn't reachable over HTTPS | An administrator runs the webhook registration script and verifies the endpoint. |
| Only 30 activities came across | The initial sync is deliberately the last 30 | Your history comes from the bulk import, not from Strava. |
| I renamed or deleted an activity on Strava, and TiZ didn't follow | Only "new activity" notifications are handled | Make the change in TiZ directly. |
| Walks, hikes, or gym sessions never sync | Only ride, run, and swim types are mapped | Add them as planned sessions and complete them manually. |
| I can't disconnect Strava | There is no disconnect button | An administrator must remove the connection. |

## Duplicates and linking

| Symptom | Cause | Fix |
| --- | --- | --- |
| The same workout appears twice | The two copies fell outside the fuzzy-match window, so they weren't merged | An administrator can run the dedup script, which keeps the best copy and repoints your links and self-evaluations at it. |
| A completed activity didn't link to its planned session | Different discipline, different calendar day, or the session was already linked | Drag the activity onto the session on the calendar. |
| It linked to the wrong session | Two sessions of the same sport on one day; the earliest-created one wins | **Unlink activity** on the session, then link the right pair by dragging. |
| The activity is on the wrong calendar day | The file carried no UTC offset, so the UTC day was used | Upload from the planned session's page, which forces the intended date. |
| "Activity must be on the same day" | Manual linking requires matching days | Link from the correct day, or upload from the session page. |

## Calendar and planning

| Symptom | Cause | Fix |
| --- | --- | --- |
| The workout pool is empty | The week has no season targets | The pool only appears for weeks inside an active season. Create a season and save with recalculate. |
| "No typed pool slots for this week" | The season was saved without recalculating slot budgets | Save the season again using **Save & recalculate**. |
| The pool panel won't open | It is desktop-only and closes below 768px wide | Use a wider window. |
| I can't drop a pool card on a day | Only the **pool week** — the one with the emerald ring — accepts drops | Navigate the pool to the week you want with **◀** / **▶**. |
| I can't reorder sessions within a day | Sessions with a **start time** are ordered by that time | Clear the start time to hand-order them. |
| The **Shift** menu isn't on the week header | Shifting is hidden for weeks inside an active season | Adjust the season plan instead. |
| **Generate sessions** is refused | The phase isn't assigned to weeks, or has no weekly template | Assign week ranges and pick a **Weekly template**, then save the Phases section. |
| Generating created nothing | "Only fill weeks with no existing sessions" skipped populated weeks | Untick it to replace previously generated sessions, or clear the weeks first. |
| Season volume edits don't stick | The timeline says "Live preview — Save & recalculate to persist volume" | Press **Save & recalculate**. |
| A season won't save | Seasons cannot overlap | Adjust the dates or archive the other season. |
| Past sessions aren't shaded green or red | Workout shading is off by default | Turn it on per sport in **Settings → Units & display → Workout shading**. |

## Workouts and export

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Set missing intensity anchors before FIT export: …" | The workout uses a target that needs a threshold you haven't set | Set the named FTP, threshold pace, race pace, **LTHR**, or **max heart rate** under **Settings → Thresholds & paces**, then export again. Bare `80%` HR targets need LTHR; `80%\|max` needs max heart rate. |
| No **Export FIT** button | The session has no structured workout | Attach or build one first. Export is per session, not from the library. |
| Relative pace shows no resolved value | The race-pace anchor it references is empty | Fill it in under **Settings → Thresholds & paces → Race paces**. |
| A completed session kept its old pace after I got faster | Relative targets are frozen to absolute values once a session is linked to an activity | Intended, so history isn't rewritten. Upcoming sessions still follow the new anchor. |
| My typed number didn't take effect | Numeric fields commit on blur or Enter, not per keystroke | Click elsewhere or press Enter. |
| I can't attach a workout to a session | Race sessions don't take structured workouts, and disciplines must match | Check both. To replace an existing workout, **Unassign** or **Edit** it first. |
| I can't rename or move a folder | Not implemented in the UI | Create the folder you want and add workouts to it. |
| I can't drag program sessions into order | Not implemented | Edit the **Day offset** field instead. |

## Workout Signaling

| Symptom | Cause | Fix |
| --- | --- | --- |
| Signaling is locked | Fewer than nine months of zone-computed history | Bulk-import more history. |
| No insights after regenerating | Not enough flagged days — it needs at least three good/great and three rough/bad | Flag more days, especially the bad ones. Contrast is what drives the analysis. |
| Fewer insights than expected | Sensitivity is too strict | Move from Standard toward Sensitive or Exploratory, remembering that looser settings surface more noise. |
| ECO patterns are missing | ECO load is disabled | Enable **Show ECO training load** in **Settings → Training & planning**. |

## Dashboard

| Symptom | Cause | Fix |
| --- | --- | --- |
| "This season" or "This cycle" ranges do nothing | They need an active season, and cycles need mesocycles | Create a season in the planner. |
| Weekly volume looks lower than my watch says | Volume prefers TiZ minutes over raw duration where zone data exists | If a session's stream was partly invalid, its zone minutes may be less than its elapsed time. |
| The PMC chart shows hours, not ECOs | ECO load is disabled | Enable it in **Settings → Training & planning**. |
| The PMC chart's dashed lines look wrong | They project from your planned sessions or season draft | Change the plan and the projection follows. |
| I can't find a list of all my activities | There isn't one | Use the calendar's **Search** pane, or scroll the calendar. |

## When to escalate

Some fixes need database or server access. Ask an administrator to look at [chapter 12](./12-configuration.md) if:

- Background jobs aren't running at all (imports never progress, zones never compute, Strava never syncs).
- You need a Strava disconnect, an activity dedup pass, or a password reset when email is not configured.
- A stuck import job needs to be force-completed or reset.
- Environment variables or feature flags need changing.

---

Next: [11. Glossary →](./11-glossary.md)
