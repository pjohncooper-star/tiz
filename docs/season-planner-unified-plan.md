# Season planner + calendar — unified plan

**Status:** Reflects **production** (`main`, July 2026). Pool spec: [calendar-workout-pool-v2.md](./calendar-workout-pool-v2.md).

**Note:** Anchor workouts have been **removed from the product**. Recurring week shape is planned via **phase layout** (V2f) and ad-hoc **weekly template** apply—not anchors.

---

## Production surfaces

| Surface | Flag / route | Role |
|---------|--------------|------|
| **Season planner** | `FEATURE_SIMPLE_SEASON_PLANNER=true` → `/plan` | Primary planning UX; **calendar week-target source** |
| **Planning calendar** | `FEATURE_PLANNING_CALENDAR=true` → `/calendar` | Week grid + workout pool sidebar |

**Removed:** Advanced 5-step wizard (`/plan/setup`, `/plan/settings/*`) and anchor workouts.

**Calendar week targets** (`week-targets.server.ts`) read **`serializeSimpleSeasonPlan` only** — not wizard `focus-tiz` presets.

---

## Season planner sections (`/plan`)

Each section has **Save** / **Cancel** (plus **Save all** in the header).

| Section | What it configures |
|---------|-------------------|
| **Season** | Name, start/end dates |
| **Races** | A/B/C goal events |
| **Timeline** | Phase spans, week selection, race markers |
| **Phase kind zone defaults** | Default Z1–Z5 **split percents** per phase kind (Base, Build, Race prep, Taper); uses zone-focus catalog |
| **Phases** | Week range, `phaseKind`, sessions/week, **intense days/week**, per-phase zone splits (slider), ramp toggles, phase goal |
| **Ramp defaults** | Season volume ramp (hours or distance + reference pace) |
| **Weekly volume** | Per-week hours, **rest-week** checkbox, read-only computed TiZ summary when row expanded |

**Settings → Zone focus:** editable focus library (Z1–Z5 presets) and athlete-level phase-kind zone defaults. Linked from the planner’s phase-kind section.

---

## Zone minutes model (production)

Week TiZ is **computed**, not edited per week:

```
zoneMinutes[discipline, zone] = disciplineHours × phaseZoneSplitPercents[zone]
```

- **Phase kind defaults** seed new phases; each phase can override splits via **Zone split** slider (4 dividers → Z1–Z5).
- Splits can **lerp** across weeks within a phase when discipline ramp is enabled.
- **Rest weeks** (`isRestWeek` on `SeasonWeek`): zone splits adjusted via plan `deLoadStrategy` (intensity shift on Z3–Z5 for de-load weeks).
- Weekly volume row expansion shows read-only `TiZ …m (Z3 …m)` per discipline.

**Removed from planner UX:** per-week zone ramp minute pills, `zoneRampDefaults` on the season model, and anchor workouts.

---

## What feeds the calendar workout pool

| Planner output | Pool use |
|----------------|----------|
| `*SessionsPerWeek` (active phase) | Unscheduled chip budget |
| `*IntenseDaysPerWeek` | Suggested interval card count |
| `SeasonWeek.zoneMinutes` (computed) | Hard-zone remaining → suggested cards; week TiZ footer |
| `isRestWeek` | Reduced hours/zones on rest weeks (via recompute) |
| Manual + template-applied sessions on calendar | Scheduled count → fewer unscheduled chips |

**Not on week targets yet:** long-ride/run minutes (no long-session section in planner on prod).

---

## Architecture (production)

```mermaid
flowchart TB
  subgraph planner [/plan]
    Phases[Sessions + intense days + zone splits]
    KindDefaults[Phase kind zone defaults]
    Volume[Weekly volume + rest weeks]
    Settings[Settings: zone focus library]
  end
  subgraph db [SeasonPlan]
    SW[SeasonWeek: hours, zoneMinutes, isRestWeek]
    SP[SeasonPhase + coachNotes]
  end
  subgraph cal [/calendar]
    WT[Week targets]
    Pool[Workout pool]
    Grid[Sessions + sessionRole]
    Template[Weekly template — manual apply]
  end
  subgraph future [Future]
    Layout[SeasonPhaseLayoutItem]
  end
  KindDefaults --> Phases
  Settings --> KindDefaults
  planner --> db
  db --> WT
  WT --> Pool
  WT --> Grid
  Pool --> Grid
  Template --> Grid
  Layout -.->|materializeSeasonWeek| Grid
```

---

## Not built (pool + planner backlog)

| Item | Notes |
|------|--------|
| Phase week layout (`SeasonPhaseLayoutItem`) | Weekday grid + `materializeSeasonWeek` — recurring week shape |
| Long session ramps in planner | Would feed LONG role / pool hints |
| Dedicated recovery/de-load section | Rest weeks exist; no load-week cadence UI on prod |
| Pool V2d–V2g | Context filter, session TiZ from splits, layout materialize, long hints |

---

## Related docs

- [calendar-workout-pool-v2.md](./calendar-workout-pool-v2.md) — pool sections, shipped vs next
- [plan-wizard-weekly-template-strategy.md](./plan-wizard-weekly-template-strategy.md) — layout vs template (future)
