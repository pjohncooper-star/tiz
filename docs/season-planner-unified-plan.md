# Season planner — unified plan (finalized)

**Status:** Planner unification **finalized locally** (branch `cursor/merge-season-planners-7b9d` + zone split work). This doc is the planner counterpart to [calendar-workout-pool-v2.md](./calendar-workout-pool-v2.md).

---

## What shipped

### Single planner at `/plan`

- **Retired:** `FEATURE_SIMPLE_SEASON_PLANNER`, `FEATURE_ADVANCED_SEASON_PLANNER`, advanced wizard routing
- **One surface:** `SimplePlannerView` — no “Advanced settings” link
- **One API path:** unified season save/load via `simple-planner.server.ts` (legacy `/plan/setup` redirects to `/plan`)

### Planner sections (collapsible)

| Section | Purpose |
|---------|---------|
| Season | Name, dates |
| Races | A/B/C goals (`GoalRaceEditor`, calendar linking) |
| Timeline | Phase spans, week selection, race markers |
| Phase kind zone defaults | Default Z1–Z5 **split percents** by phase kind (Base, Build, …) |
| Phases | Phase spans, sessions/week, **intense days/week**, per-phase zone splits, volume trend |
| Ramp defaults | Season-level volume ramp (hours or distance + pace) |
| Recovery & de-load | Load-week cadence, volume %, zone mode on recovery weeks |
| Long sessions | Long ride/run ramp defaults + week chart |
| Anchor workouts | `AnchorEditor` with season \| phase scope |
| Weekly volume | Hours, de-load flags, long ride/run minutes per week |

### Zone model (zone split percents)

Replaces per-week zone ramp minute pills:

- Each phase stores **zone split percents** per discipline (Z1–Z5, sum to 100%)
- Seeded from phase kind defaults; overridable per phase in Phases pane
- `SeasonWeek.zoneMinutes` = `disciplineHours × splitPercents`, adjusted on recovery weeks
- Recovery **intensity_shift** mode cuts Z3–Z5 and boosts Z1 on de-load weeks

### Calendar integration

`week-targets.server.ts` → `serializeSimpleSeasonPlan`:

- Session counts + intense days from active phase
- `zoneMinutes`, `isRestWeek`, hours per discipline
- Phase name/color for calendar chrome

**Not yet on week targets (pool V2g):** `longRideMinutes`, `longRunMinutes`

---

## Architecture

```mermaid
flowchart TB
  subgraph planner [/plan — season planner]
    Phases[Sessions + intense days + zone splits]
    Volume[Weekly volume + recovery]
    Long[Long session ramps]
    Anchors[Anchor workouts]
  end
  subgraph db [SeasonPlan]
    SW[SeasonWeek: hours, zoneMinutes, long mins, de-load]
    SP[SeasonPhase + coachNotes]
    AW[AnchorWorkout]
  end
  subgraph cal [Calendar]
    WT[Week targets]
    Pool[Workout pool]
    Grid[Sessions + sessionRole]
  end
  planner --> db
  db --> WT
  WT --> Pool
  WT --> Grid
  AW -->|materialize| Grid
```

---

## Still to build

| Item | Feeds |
|------|-------|
| `SeasonPhaseLayoutItem` + week grid editor in Phases | Weekday `sessionRole`; `materializeSeasonWeek` |
| `longRideMinutes` / `longRunMinutes` on calendar week targets | Pool long-session suggestions (V2g) |
| Import athlete weekly template → phase layout | Starting preset for layout grid |

---

## Workout pool dependency summary

See [calendar-workout-pool-v2.md](./calendar-workout-pool-v2.md) for pool phases V2d–V2g.

| Planner output | Pool section |
|----------------|--------------|
| Session counts − scheduled | Unscheduled |
| Intense days + remaining Z3–Z5 | Suggested |
| `zoneMinutes` | Week TiZ footer + hard-zone budget |
| Anchors on calendar | Fewer unscheduled chips |
| Layout + long mins (future) | Context filter + LONG hints |
