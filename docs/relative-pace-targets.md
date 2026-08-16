# Relative pace targets (CSV & programs)

Programs often prescribe **5k pace**, **10k pace**, or **threshold** — not a fixed `mm:ss`. Absolute paces go stale when fitness changes mid-block.

## How it works

1. CSV / workout tree stores a **relative** target (`mode: "relative"`, `ref: "10k"`, optional `pct`).
2. Athlete sets race-pace anchors in **Settings → Race paces** (canonical min/km).
3. Display and FIT export **resolve** against current anchors + threshold profile.
4. Updating a 5k pace mid-program retargets future calendar sessions that still store relative refs — no re-apply.
5. When a planned session is **linked to an activity**, relative targets are **frozen** to absolute values for history.

## CSV

```csv
signal,target_mode,target
pace,relative,threshold
pace,relative,10k
pace,relative,95%|5k
power,value,130%
heart_rate,value,80%
heart_rate,value,80%|max
heart_rate,relative,80% of lthr
```

| `target` token | Meaning |
|----------------|---------|
| `threshold` | Current run/swim threshold pace |
| `5k` / `10k` / `half` / `marathon` | Fitness race-pace anchors |
| `95%\|10k` or `95% of 10k` | Percent of anchor **speed** (95 = slightly slower than 10k) |
| `130%` (power) | Percent of FTP — stored relative, resolved live |
| `80%` or `80%\|lthr` or `80% of lthr` (HR) | Percent of sport **LTHR** — stored relative, resolved live |
| `80%\|max` or `80% of max` (HR) | Percent of athlete **max heart rate** — stored relative, resolved live |

Do **not** set `zone` / `target_low` / `target_high` with `relative` pace. Absolute paces still use `target_mode=value` and `target=4:30`.

## Program library (`/plan/training-plans`)

Dedicated pages (not Settings) for reusable programs:

- **List** — CSV import, create from a calendar date range, apply, clear future, delete.
- **Editor** (`/plan/training-plans/[id]`) — edit session metadata and structured workout trees (`WorkoutTreeEditor`).
- **Apply** — copies library sessions onto the calendar; preview lists sessions plus missing race-pace / FTP / LTHR / max-HR anchors.
- **Clear future** — removes calendar sessions from this program from today onward (past stays).
- **Delete** — removes the library program; applied calendar sessions stay (untagged).

Settings keeps only a thin link into Programs.

### Intensity on copy / no auto-sync

- Trees are copied **as stored**: relative targets stay relative; absolute / frozen steps stay absolute.
- Calendar edits never rewrite the library unless you explicitly **create a program from a calendar range** (or a later explicit “sync this session” action).
- Apply stamps `PlannedSession.trainingPlanSessionId` for future adherence analytics (UI not built yet).

## Mid-program updates

After a faster 5k: edit **Settings → Race paces → 5k**. Upcoming workouts with `ref: "5k"` show the new pace the next time they render or export to FIT. Completed/linked sessions keep the frozen absolute pace.
