# Relative pace targets (CSV & plans)

Training plans often prescribe **5k pace**, **10k pace**, or **threshold** — not a fixed `mm:ss`. Absolute paces go stale when fitness changes mid-block.

## How it works

1. CSV / workout tree stores a **relative** target (`mode: "relative"`, `ref: "10k"`, optional `pct`).
2. Athlete sets race-pace anchors in **Settings → Race paces** (canonical min/km).
3. Display and FIT export **resolve** against current anchors + threshold profile.
4. Updating a 5k pace mid-plan retargets future calendar sessions that still store relative refs — no re-apply.
5. When a planned session is **linked to an activity**, relative targets are **frozen** to absolute values for history.

## CSV

```csv
signal,target_mode,target
pace,relative,threshold
pace,relative,10k
pace,relative,95%|5k
power,value,130%
heart_rate,value,80%
```

| `target` token | Meaning |
|----------------|---------|
| `threshold` | Current run/swim threshold pace |
| `5k` / `10k` / `half` / `marathon` | Fitness race-pace anchors |
| `95%\|10k` or `95% of 10k` | Percent of anchor **speed** (95 = slightly slower than 10k) |
| `130%` (power) / `80%` (HR) | Percent of FTP / max HR — stored relative, resolved live |

Do **not** set `zone` / `target_low` / `target_high` with `relative` pace. Absolute paces still use `target_mode=value` and `target=4:30`.

## Plan library (Settings)

- **Browse** — preview plan sessions and relative pace refs; rename the plan.
- **Apply** — shows session list in the window plus a checklist of missing race-pace / FTP / max-HR anchors.
- **Clear future** — removes calendar sessions from this plan from today onward (past stays).
- **Delete** — removes the library plan; applied calendar sessions stay (untagged).

## Mid-plan updates

After a faster 5k: edit **Settings → Race paces → 5k**. Upcoming workouts with `ref: "5k"` show the new pace the next time they render or export to FIT. Completed/linked sessions keep the frozen absolute pace.
