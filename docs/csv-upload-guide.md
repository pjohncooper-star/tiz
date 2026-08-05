# Planned sessions CSV upload guide

Import planned workouts from a CSV in **Settings → CSV import**.

You can either:

1. **Upload to calendar** — sessions land on the absolute dates in the file.
2. **Save as training plan** — dates become relative offsets from the first session day (day 0), so you can re-apply the plan later.

Download a blank header row with **Download template**. A fuller example lives at [`docs/samples/week-2027-07-05.csv`](./samples/week-2027-07-05.csv).

---

## Limits and file rules

| Rule | Value |
|------|--------|
| Max data rows | 2,000 |
| Max file size | 1 MB |
| Encoding | UTF-8 text CSV |
| Header row | Required (row 1) |
| Required header columns | `date`, `discipline` |
| Other known columns | Optional; omit freely |
| Unknown columns | Ignored |
| Empty rows | Skipped |
| Duplicate known headers | Rejected |

Quoted fields and commas inside quotes are supported (standard CSV).

Distances, paces, and speeds use your **Units** settings (metric vs imperial). Swim yard/meter choice follows the session `pool` (or your swim pool setting when `pool` is blank).

Percent power / heart-rate targets (`130%`, `80%`) need athlete **bike FTP** and **max HR** set in the app.

---

## Two shapes of upload

### Skeleton session (no steps)

One row per session. Leave all step columns blank.

Creates a calendar card with title, duration, distance, pace/speed, role, etc. No structured workout tree / FIT steps.

### Structured workout (with steps)

Multiple rows that share the same **`date` + `discipline` + `title`** are grouped into one session. Session-level fields may appear on any of those rows (first non-empty value wins). Step columns build the workout tree.

```text
date + discipline + title  →  one planned session
  └─ step rows (step / kind / …)  →  workout tree
```

---

## Session columns

These describe the planned session as a whole.

| Column | Type | Required | Allowed values / format | Behavior |
|--------|------|----------|-------------------------|----------|
| `date` | date string | **Yes** | `yyyy-MM-dd` (e.g. `2027-07-05`) | Calendar mode: scheduled day. Plan mode: relative day offset from the earliest date in the file (that day becomes offset 0). |
| `discipline` | enum | **Yes** | `BIKE`, `RUN`, `SWIM` (case-insensitive) | Sport of the session. **Strength is not supported** in CSV. |
| `title` | string | No | Max 200 chars | Display name. Blank → default title for the discipline (e.g. “Run”). **Also part of the session group key** with date + discipline — different titles on the same day create separate sessions. |
| `duration_min` | positive integer | No | Whole minutes, e.g. `45` | Session estimated duration. If omitted and the workout has steps, duration is estimated from the tree (time steps + open estimates; distance steps need pace context when rolling up). |
| `distance` | positive number | No | See [Units](#units-distance-pace-speed) | Session-level planned distance (skeleton metrics / summaries). Independent of per-step distances. |
| `pace_or_speed` | string / number | No | **RUN/SWIM:** pace `mm:ss`. **BIKE:** speed number. | Session-level target pace (run/swim) or speed (bike). Units follow athlete settings. |
| `notes` | string | No | Max 2000 chars | Session notes. |
| `role` | enum | No | `EASY`, `MODERATE`, `INTENSITY`, `LONG` | Session role for TiZ / shading / planning. Blank → inferred from title and duration. |
| `pool` | enum | Swim only | `SCY`, `SCM`, `LCM` | Pool length for swim. Blank on swim → athlete swim pool setting. Invalid on bike/run. Also selects yard vs meter for swim distance/pace. |

### Units (distance, pace, speed)

Interpreted with your discipline Units setting (swim uses pool):

| Discipline | Setting | `distance` / step distance means | Pace (`mm:ss`) means | Speed means |
|------------|---------|----------------------------------|----------------------|-------------|
| RUN / BIKE | Metric | kilometers | min / km | km/h (bike) |
| RUN / BIKE | Imperial | miles | min / mi | mph (bike) |
| SWIM | SCY | yards | min / 100 yd | — |
| SWIM | SCM / LCM | meters | min / 100 m | — |

Examples:

- Metric run `distance=10` → 10 km  
- Imperial run `distance=10` → 10 mi  
- SCY swim step `duration=100` with `duration_type=distance` → 100 yd  

---

## Step columns

Leave all of these blank for skeleton sessions. If any step column is filled, the row is treated as a step/repeat row and must satisfy step rules.

| Column | Type | When required | Allowed values / format | Behavior |
|--------|------|---------------|-------------------------|----------|
| `step` | dotted id | On every step/repeat row | Digits and dots, e.g. `1`, `2.1`, `2.1.1` | Orders and nests the tree. Max **3** segments (`a.b.c`). Parent of `2.1` must be repeat `2`. Duplicate ids in one session → error. |
| `kind` | enum | With `step` | `step`, `repeat` | `step` = leaf interval. `repeat` = container that multiplies children. |
| `intensity` | enum | `kind=step` | `warmup`, `active`, `interval`, `recovery`, `rest`, `cooldown` | Step type shown in the workout tree / device export (warmup, work, rest, etc.). |
| `duration_type` | enum | `kind=step` | `time`, `distance`, `open` | How the step ends — see [Step length](#step-length-duration_type). |
| `duration` | number | `time` / `distance`; optional for `open` | **time/open:** minutes (decimals OK, e.g. `0.5` = 30s). **distance:** athlete distance units (table above). | Length of the step, or optional estimate for lap-end (`open`). |
| `zone` | integer 1–7 | Optional | `1`…`7` | Zone target when `target_mode` is `zone` (default). If blank in zone mode: zone `2`, or `1` for `rest`. **Cannot** combine with absolute `target` / `target_low` / `target_high`. |
| `signal` | enum | Optional | `power`, `heart_rate`, `pace`, `speed`, `open` | What the target applies to. Blank → default for discipline (`power` bike, `pace` run/swim), or `open` for `rest` intensity. `signal=open` means **no intensity target** (not lap-end). |
| `repeat` | positive integer | `kind=repeat` | e.g. `3`, `10` | How many times children of this repeat run. Only valid on repeat rows. |
| `step_notes` | string | Optional | Max 2000 chars | Notes on that step or repeat block. |
| `target_mode` | enum | Optional | `zone` (default), `range`, `value` | How to interpret target columns — see [Targets](#targets). |
| `target_low` | number / pace / `%` | `target_mode=range` | Same units as `target` | Low end of a range target. |
| `target_high` | number / pace / `%` | `target_mode=range` | Same units as `target` | High end of a range target. |
| `target` | number / pace / `%` | `target_mode=value` | See [Targets](#targets) | Single absolute (or percent) target. |

### Repeat rows

For `kind=repeat`, only these step fields are allowed:

- `step`, `kind`, `repeat`, `step_notes`

Do **not** set intensity, duration, zone, signal, or target fields on a repeat row.

Children nest under the repeat via dotted ids:

```csv
...,2,repeat,,,,,,3,,,,,,
...,2.1,step,interval,time,0.5,,power,,,value,,,130%
...,2.2,step,rest,time,0.5,,power,,,value,,,20%
```

Nested repeats (max depth 3):

```csv
...,2,repeat,,,,,,3,,,,,,
...,2.1,repeat,,,,,,10,inner set,,,,,
...,2.1.1,step,interval,time,0.5,,power,,,value,,,130%
...,2.1.2,step,rest,time,0.5,,power,,,value,,,20%
...,2.2,step,recovery,time,5,1,power,,,,,,
```

---

## Step length (`duration_type`)

| Value | Meaning | `duration` column | Device / editor behavior |
|-------|---------|-------------------|---------------------------|
| `time` | Fixed time | **Required** — minutes (decimals OK) | Step ends when time elapses. |
| `distance` | Fixed distance | **Required** — km/mi/m/yd per units table | Step ends at that distance. |
| `open` | Lap-button end | **Optional** — estimate in minutes | Step ends when the athlete presses Lap. Estimate is for charts/totals only. |

Steps in one workout may mix `time`, `distance`, and `open`.

> **Don’t confuse** `duration_type=open` (lap end) with `signal=open` (no power/pace/HR target). Rest steps in the sample file often use `signal=open` with `duration_type=time`.

---

## Targets

`target_mode` chooses how zone / absolute columns are read. If omitted:

- `target` filled → `value`
- `target_low` / `target_high` filled → `range`
- otherwise → `zone`

### `target_mode=zone` (default)

| Fields | Rules |
|--------|--------|
| `zone` | Optional 1–7; default 2 (1 for rest) |
| `target`, `target_low`, `target_high` | Must be empty |

Stores a zone target on the chosen `signal` (or discipline default).

### `target_mode=value`

| Fields | Rules |
|--------|--------|
| `target` | **Required** |
| `zone`, `target_low`, `target_high` | Must be empty |

### `target_mode=range`

| Fields | Rules |
|--------|--------|
| `target_low`, `target_high` | **Both required** |
| `zone`, `target` | Must be empty |

### Absolute / percent formats by signal

| `signal` | Format | Notes |
|----------|--------|--------|
| `power` | Watts (`250`) or `%` of FTP (`130%`) | `%` needs bike FTP on the athlete. |
| `heart_rate` | bpm (`150`) or `%` of max HR (`80%`) | `%` needs max HR on the athlete. |
| `pace` | `mm:ss` (e.g. `4:30`) | RUN/SWIM only. Units = min/km, min/mi, min/100m, or min/100yd. |
| `speed` | Number | km/h or mph from Units. |
| `open` | (none) | No target. Cannot combine with zone or absolute columns. |

Percent values are resolved to absolute watts/bpm **at import time**.

---

## What the import creates

| Input | Result |
|-------|--------|
| Skeleton row | Planned session with metrics; no structured workout |
| Grouped step rows | Planned session + structured workout tree (editable in the workout builder, exportable to FIT) |
| `role` | Drives session classification / TiZ expectations |
| Step intensities & targets | Drive profile chart, execution comparison, and device step targets |
| `duration_type=open` | Lap-button steps in FIT export |
| Calendar upload | Sessions on the given dates |
| Training plan save | Relative plan; first CSV date → day 0; gaps between dates become rest days |

### Training plan gap checks

When saving as a plan:

- Gap **> 21 days** between consecutive sessions → warning after save  
- Gap **> 90 days** → blocked until you confirm **Save anyway**  
- Plan duration cap: 182 days; session cap: 500  

---

## Minimal examples

### Skeleton bike

```csv
date,discipline,title,duration_min,distance,pace_or_speed,notes,role,pool
2027-07-08,BIKE,Endurance,90,40,28,,MODERATE,
```

### Structured run (mixed length)

```csv
date,discipline,title,role,step,kind,intensity,duration_type,duration,zone,signal,target_mode,target
2027-07-09,RUN,Mixed length,MODERATE,1,step,warmup,distance,1.6,2,pace,,,
2027-07-09,RUN,Mixed length,MODERATE,2,step,active,time,16,4,pace,,,
2027-07-09,RUN,Mixed length,MODERATE,3,step,active,open,12,4,pace,,,
2027-07-09,RUN,Mixed length,MODERATE,4,step,cooldown,distance,1.6,2,pace,,,
```

(With metric units, `1.6` ≈ 1.6 km.)

### Bike VO2 with percent FTP

```csv
date,discipline,title,role,step,kind,intensity,duration_type,duration,signal,repeat,target_mode,target
2027-07-05,BIKE,VO2,INTENSITY,1,step,warmup,time,10,power,,,
2027-07-05,BIKE,VO2,INTENSITY,2,repeat,,,,,,3,,
2027-07-05,BIKE,VO2,INTENSITY,2.1,step,interval,time,0.5,power,,,value,130%
2027-07-05,BIKE,VO2,INTENSITY,2.2,step,rest,time,0.5,power,,,value,20%
2027-07-05,BIKE,VO2,INTENSITY,3,step,cooldown,time,10,power,,,
```

---

## Common errors

| Message / symptom | Fix |
|-------------------|-----|
| `date must be yyyy-MM-dd` | Use ISO dates (`2027-07-05`), not `7/5/2027`. |
| `discipline must be BIKE, RUN, or SWIM` | Strength / other sports aren’t importable yet. |
| Zone + absolute targets together | Pick one mode: zone **or** value/range — don’t fill `zone` and `target*` together. |
| `power percent targets require athlete bike FTP` | Set FTP in athlete settings, or use absolute watts. |
| `missing parent step` | Every `2.1` needs a `2` repeat row. |
| `parent must be a repeat row` | Only repeats can have children. |
| `step nesting deeper than 3 levels` | Flatten; `1.1.1.1` is not allowed. |
| Duplicate step id | Unique `step` ids within a session group. |
| Wrong distance magnitude | Check metric km vs imperial miles (and swim m vs yd). |

---

## Field checklist (quick)

**Session:** `date`, `discipline`, `title`, `duration_min`, `distance`, `pace_or_speed`, `notes`, `role`, `pool`

**Step leaf:** `step`, `kind=step`, `intensity`, `duration_type`, `duration` (unless open), optional `zone` / `signal` / targets / `step_notes`

**Repeat:** `step`, `kind=repeat`, `repeat`, optional `step_notes`
