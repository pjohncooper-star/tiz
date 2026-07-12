# Calendar workout pool — V2 spec

**Status:** **V2a–V2c shipped** on production. Planner context: [season-planner-unified-plan.md](./season-planner-unified-plan.md) (reflects `main` as of July 2026).

**Confirmed UX:** Left sidebar on calendar week view. **Session role** enum: `easy | moderate | intensity | long`. Tabs vs scrollable list — **TBD**.

**Requires:** `FEATURE_PLANNING_CALENDAR=true`. Week targets require an active season from the planner (`FEATURE_SIMPLE_SEASON_PLANNER=true`).

---

## Purpose

After the season plan sets weekly intent, the athlete still needs to:

1. **Place** sessions in the weekly budget but not yet on the grid (unscheduled)
2. **Choose** structured workouts from the library
3. **Assign TiZ** per session — aligned with computed week zone minutes

The pool handles (1) and (2); TiZ assignment on placement or in the session editor (3).

---

## Calendar layout (production)

```
┌──────────────────┬─────────────────────────────────────────────┐
│  Workout pool    │  Week grid (Mon–Sun)                        │
│  ─ Unscheduled ─ │  · Manual + anchor + template sessions      │
│  Swim ×1         │  · sessionRole badges (intensity, long)     │
│  ─ Suggested ─   │  · Drop targets                             │
│  [interval cards]│                                             │
│  ─ Library ─     │                                             │
│  [folder tree]   │                                             │
│  ─ Week TiZ ─    │                                             │
│  budget vs done  │                                             │
└──────────────────┴─────────────────────────────────────────────┘
```

Sidebar is **week-scoped**: changing weeks refreshes unscheduled counts, suggested cards, and zone rollup.

---

## Planner inputs (production)

From `getCalendarWeekTargets` → `serializeSimpleSeasonPlan`:

| Planner source | Field | Pool use |
|----------------|-------|----------|
| **Phases** (active week) | `swim/bike/runSessionsPerWeek`, `strengthSessionsPerWeek` | Unscheduled chip counts |
| **Phases** | `swim/bike/runIntenseDaysPerWeek` | Split remaining Z3–Z5 across N **Suggested** cards |
| **Phases** | `zoneSplits` (Z1–Z5 % per discipline) | Drives `SeasonWeek.zoneMinutes` after recompute |
| **Phase kind zone defaults** | Defaults by Base / Build / … | Seeds phase splits |
| **Settings → Zone focus** | Focus library presets | Labels and default percents for splits |
| **Ramp defaults + weekly volume** | Hours per discipline; `isRestWeek` | Scales zone totals; de-load adjustment on rest weeks |
| **Anchors** (plan builder / wizard) | Materialized `PlannedSession` | Count as scheduled → lower unscheduled |

Zone minutes on the week are **computed** (`zone-split.ts`): discipline hours × split percents, with de-load shift when `isRestWeek`. Athletes do **not** edit zone minutes per week in the planner table (read-only TiZ in expanded rows).

### Intensity: two models

| Model | Where (prod) | Pool today |
|-------|--------------|------------|
| **Intense day count** | Phases pane | **Suggested** card count + hard-zone split |
| **Session role** | `PlannedSession.sessionRole` + calendar UI | ⚡ badge; manual cycle or infer from workout |

Weekday layout (`SeasonPhaseLayoutItem`) is **not built** — intensity weekday assignment is manual on the calendar for now.

---

## Pool sections

### 1. Unscheduled — shipped

`max(0, phaseSessionBudget − scheduled)` per discipline (+ strength). Races excluded.

- Drag chip → day creates flexible session
- Drop library/suggested workout on chip → arm → drag to day (place + apply)
- Anchors and template-applied sessions count toward scheduled

### 2. Suggested — shipped

Generated from `computeHardZoneBudgets` + `generateWeekPalette`:

- Remaining Z3–Z5 minutes per discipline (week target minus planned session zones)
- Divided across `intenseDaysPerWeek` from the active phase
- Strides (run) and spin-ups (bike) priming cards included
- Reps/duration editable on card before drag

### 3. Library — shipped

Folder tree; discipline filter. Drag to day (create + apply), session (apply), or unscheduled combo flow. Hard workout apply can bump `sessionRole` from `MODERATE`.

**Not shipped:** intensity-context filtering (V2d).

### 4. Week TiZ footer — shipped

Planned + completed zone rollup vs `weekTarget.zoneMinutes` (from planner recompute). Read-only.

---

## TiZ assignment

| When | How | Prod |
|------|-----|------|
| Planner save + recalculate | `SeasonWeek.zoneMinutes` from splits × hours | Yes |
| Apply structured workout | Step rollup; may bump `sessionRole` | Yes |
| Session editor | Manual zone pills | Yes |
| Place unscheduled / layout slot | Default from role + split | **V2e** (not built) |
| Layout materialize | Role-based allocation | **V2f** (not built) |

`zoneAllocationMissing` on sessions — candidate for future “needs TiZ” pool filter.

---

## Session roles — shipped (calendar)

| Role | Visual |
|------|--------|
| `intensity` | Amber border + ⚡ |
| `long` | Violet border + badge |
| `easy` | Emerald border + badge |
| `moderate` | Default; “Set role” cycles |

Also on athlete **weekly template** items (preset only; not season layout).

---

## Phased delivery

| Phase | Scope | Status |
|-------|--------|--------|
| **V2a** | Unscheduled chips; drag to day | **Shipped** |
| **V2b** | Library browse; drag to day/session | **Shipped** |
| **V2b+** | Unscheduled + library/suggested combo drops | **Shipped** |
| **V2c** | `sessionRole` visuals; template item roles | **Shipped** |
| **V2d** | Library/suggested filtered by selected day + `sessionRole` | Next |
| **V2e** | Session `targetZones` from role + week zone splits on placement | Next |
| **V2f** | Phase week layout + `materializeSeasonWeek` | Next |
| **V2g** | Long-session hints (needs planner long-session fields on week targets) | Backlog |

---

## Recommended implementation order

| # | Work | Why now |
|---|------|---------|
| 1 | **V2d** — rank library/suggested by selected day + session roles | No schema; uses existing calendar selection |
| 2 | **V2e** — `allocateSessionZones(role, discipline, weekSplits, weekZoneMinutes)` on create/place | Zone split model is live on prod |
| 3 | **V2f** — layout schema + materialize | Weekday intensity before workouts picked |
| 4 | **V2g** — long minutes on week targets + LONG suggestions | After planner exposes long sessions |
| 5 | Rest-week badge in pool when `weekTarget.isRestWeek` | Small UX; data already on targets |

---

## Interaction flows

### A — Fill unscheduled (works today)

1. Phase budget: 3 swim, 2 scheduled → pool shows **Swim ×1**
2. Drag chip to Wednesday → flexible session
3. Drag suggested or library workout onto session
4. Chip gone

### B — Intensity from planner counts (partial)

1. Phase: `bikeIntenseDaysPerWeek: 2`, week has Z4 bike minutes from splits
2. Pool shows ~2 bike interval suggested cards
3. User places on calendar; sets ⚡ via role cycle or hard workout apply
4. **V2d:** selecting an intensity session would boost threshold templates in library

### C — Rest week

1. User checks **Rest** on a week in weekly volume; saves with recalculate
2. Hours and zone minutes drop (de-load strategy on plan)
3. Suggested cards shrink; pool footer reflects lower Z3–Z5 budget

---

## Decisions (confirmed)

| Item | Choice |
|------|--------|
| Sidebar | **Left** |
| Session role | **Enum** (not boolean intensity flag) |
| Week zone budget | **Computed** from phase zone split % × volume |
| Intense day cardinality | Phase pane counts → suggested cards |
| Intensity weekday | Calendar `sessionRole` today; layout later |
| Planner | **`/plan` simple planner**; optional advanced wizard |

## Open items

- [ ] Tabs vs single scrollable pool sections
- [ ] Library tags/folders for threshold · VO2 filtering
- [ ] “Needs TiZ” filter (`zoneAllocationMissing`)
- [ ] Brick / multisport (future)
