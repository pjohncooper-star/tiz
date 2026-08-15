[← Guide index](./README.md)

# 9. Settings reference

**Settings** in the sidebar opens a hub of five categories, also reachable from the tabs at the top of any settings page: **All settings**, **Units & display**, **Thresholds & paces**, **Training & planning**, **Workouts**, **Integrations**.

## Units & display

### Units

Set per sport, because most people don't think in one system for everything — miles for running and kilometres for cycling is a common combination.

| Setting | Options | Default |
| --- | --- | --- |
| Bike **Units** | Metric / Imperial | Metric |
| Run **Units** | Metric / Imperial | Metric |
| Swim **Units** | Metric / Imperial | Metric |
| Swim **Default pool size** | SCY (25y), SCM (25m), LCM (50m) | SCM (25m) |

Bike units drive speed and distance in the planner and on session cards; run units drive pace and distance; swim units drive pace and distance for session totals and reporting. **Pool size** is what determines the units on swim workout step cards — a 25-yard pool means your sets are written in yards.

Press **Save units**.

### Workout shading

> *"Shade past planned workout cards on the calendar by comparing planned vs completed metrics. Within 10% is green, within 25% is amber, outside 25% or not completed is red. Completed work with no planned target stays green. Off uses gray for past workouts."*

| Setting | Options | Default |
| --- | --- | --- |
| **Apply shading to** | Session card only / Metric pills only / Both card and metric pills | Both |
| Bike **Past workout shading** | Off / Duration / Distance / TiZ | Off |
| Run **Past workout shading** | Off / Duration / Distance / TiZ | Off |
| Swim **Past workout shading** | Off / Elapsed duration / Moving duration / Distance / TiZ | Off |
| Strength **Past workout shading** | Off / Duration | Off |

Shading is off by default because which metric matters depends on how you train. Pick **Duration** if you plan by time, **Distance** if you plan by distance, **TiZ** if you care whether the intensity distribution matched — that last one is the strictest and the most informative, since it catches easy runs done too hard as well as sessions cut short.

Swim distinguishes **elapsed** from **moving** duration, which for pool swimming is the difference between the hour you were at the pool and the time actually swimming.

Press **Save workout shading**.

## Thresholds & paces

Fully covered in [chapter 2](./02-thresholds-and-zones.md). In brief:

### Race paces

Optional per-kilometre anchors: **5k pace**, **10k pace**, **Half marathon pace**, **Marathon pace**, plus optional **Goal 5k / 10k / half / marathon**. These resolve relative pace targets in workouts and plans, and updating one retargets upcoming workouts automatically.

### Current thresholds

> *"Set your best-guess thresholds for today. Structured workouts score TiZ from how they were built (watts, HR, or pace). The primary metric and optional role overrides apply when a session has no structured workout, and as stream fallback. Customize zone boundaries per sport and signal when needed."*

A single **Max heart rate (bpm)** at the top (used only for `% of max` workout targets); FTP and LTHR for the bike, threshold pace and LTHR for the run, threshold pace for the swim; the **Primary** metric per sport; **Edit zone boundaries** to customize cutoffs; and **TiZ metric by session role** to score easy and hard days by different signals. **Save changes** commits. TiZ zones still use LTHR, not max HR.

### Threshold & primary metric history

Behind **Show history**. Effective-dated threshold and primary-metric entries, so historical activities are scored against the fitness you actually had at the time.

## Training & planning

### Zone focus

Your library of named intensity distributions — the Z1–Z5 percentage splits a season phase can use. The seeded set is Aerobic base, Threshold, VO2 max, Race specificity, Freshness, Strength/power, and Maintenance; each is editable, and **Add focus** creates your own with Z1–Z5 sliders.

Below the library, **default zone focus by phase kind** maps Base, Build, Race prep, and Taper to a focus. Those defaults apply to **new seasons only** — existing seasons keep what they were saved with, and you change them on the season page.

The percentages behind each preset are listed in [chapter 5](./05-season-planner.md#zone-focus-and-tiz-targets).

### Training load (ECO)

> *"ECO (Objective Load Equivalents) scores each swim, bike, and run with one comparable load unit. When off, planner and calendar hide all ECO references."*

One checkbox, **Show ECO training load**, off by default. It affects activity scores, weekly totals, the PMC chart's unit, and Workout Signaling's load patterns. Turning it off deletes ECO-based signaling insights.

See [chapter 4](./04-dashboard-and-analysis.md#training-load-eco) for what ECO is and how it is computed.

## Workouts

### Swim equipment

The list offered as toggles on swim workout steps. Default: **Kickboard**, **Fins**, **Pull buoy**, **Paddles**, **Snorkel**. Rename or delete entries (at least one must remain) and **Add equipment** for anything else you use — a band, a tempo trainer, a swim parachute.

Equipment appears in exported FIT step notes, so it reaches your watch.

### Self evaluation

Configures the fields on the **Self evaluation** card of every completed workout.

Two are required and cannot be removed:

| Field | Type |
| --- | --- |
| **How it felt** | Five-point feel scale (Very weak → Very strong) |
| **Perceived effort** | RPE 1–10 |

Optional additions: **Sleep quality**, **Motivation**, **Soreness** (1–5 scales), **Notes** (free text), or a custom scale with your own label and a maximum from 1 to 10. Six fields total is the maximum.

Keep it short. A three-field form gets filled in every day; a six-field form gets skipped, and skipped self-evaluations are what starve Workout Signaling.

Press **Save self-eval fields**.

## Integrations

### Strava

Shows **Connected (athlete #…)** when linked, otherwise a **Connect Strava** link. See [chapter 3](./03-importing-and-syncing.md#strava).

**Known limitation:** there is no disconnect button. Reconnecting replaces the stored tokens; a genuine disconnect needs an administrator.

### Calendar subscription

> *"Subscribe in Apple Calendar, Google Calendar, or Outlook using a private URL. Upcoming planned workouts (90 days) are included. Timed sessions use their start time; untimed sessions appear as all-day events."*

| Control | Effect |
| --- | --- |
| **Generate subscription URL** | Creates the feed and its private token |
| **Copy URL** | Copies it |
| **Regenerate** | Issues a new URL and invalidates the old one |
| **Disable** | Turns the feed off |

Treat the URL as a secret — anyone who has it can read your planned training. **Regenerate** is what you use if it leaks.

---

Next: [10. Troubleshooting →](./10-troubleshooting.md)
