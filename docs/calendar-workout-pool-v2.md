# Calendar workout pool — V2 spec

**Status:** **V2a–V2c shipped** on calendar (July 2026). Planner unification **finalized locally** — see [season-planner-unified-plan.md](./season-planner-unified-plan.md).

**Confirmed UX:** Workout pool lives in a **left sidebar** on the calendar week view. **Session role** uses enum `easy | moderate | intensity | long`. Tabs vs single scrollable list — **TBD**.

**Next pool work:** context-aware filtering (V2d), TiZ allocation from zone splits + role (V2e), long-session hints (V2g), phase layout materialize (V2f).

---

## Purpose

After the season plan defines weekly intent, the athlete still needs to:

1. **Place** sessions that are in the weekly budget but not yet on the grid (unscheduled)
2. **Choose** concrete structured workouts from the library
3. **Assign TiZ targets** per session — aligned with the week's computed zone minutes

The **workout pool** sidebar is the hub for (1) and (2); TiZ assignment happens on placement or in-session (3).

---

## Calendar layout

```
┌──────────────────┬─────────────────────────────────────────────┐
│  Workout pool    │  Week grid (Mon–Sun)                        │
│  (left sidebar)  │  · Anchors + manual sessions                │
│                  │  · sessionRole visual (intensity, long)     │
│  ─ Unscheduled ─ │  · Drop targets for pool items              │
│  Swim ×1         │                                             │
│  ─ Suggested ─   │                                             │
│  [interval cards]│                                             │
│  ─ Library ─     │                                             │
│  [folder tree]   │                                             │
│  ─ Week TiZ ─    │                                             │
│  budget vs done  │                                             │
└──────────────────┴─────────────────────────────────────────────┘
```

Sidebar is **week-scoped**: switching calendar weeks updates unscheduled counts, suggested cards, library context, and week zone rollup.

Requires `FEATURE_PLANNING_CALENDAR=true`.

---

## Planner inputs (finalized season planner)

The pool reads week context from `getCalendarWeekTargets` → `serializeSimpleSeasonPlan`. The **season planner at `/plan`** is the sole source — the advanced wizard is retired.

| Planner section | Data | Pool use |
|-----------------|------|----------|
| **Phases** | `*SessionsPerWeek`, `*IntenseDaysPerWeek` per discipline | Unscheduled chip counts; suggested card count (`generate-workouts.ts` ÷ intense days) |
| **Phases** | Per-phase **zone split percents** (Z1–Z5 per discipline) | Week `zoneMinutes` after recompute → hard-zone budget for suggested cards |
| **Phase kind zone defaults** | Default splits by phase kind (Base, Build, …) | Seeds new phases; inherited unless overridden |
| **Recovery & de-load** | Cadence (load weeks), volume %, zone mode (`proportional` \| `intensity_shift`) | `isRestWeek` + reduced/adjusted `zoneMinutes` on recovery weeks |
| **Ramp defaults + Weekly volume** | Hours per discipline per week | Discipline hours in week target; scales zone minute totals |
| **Long sessions** | `longRideMinutes`, `longRunMinutes` per week | **Not wired to pool yet** — V2g: suggest LONG role / endurance templates |
| **Anchor workouts** | Recurring key sessions (scope season \| phase) | Materialized sessions count toward scheduled total (fewer unscheduled chips) |

### Zone minutes (important change)

Week TiZ is **computed**, not hand-edited per week:

```
zoneMinutes = disciplineHours × phaseZoneSplitPercents × recoveryAdjustments
```

(`recalculateZoneMinutesFromSplits` in `zone-split.ts`; replaces per-week zone ramp pills.)

Recovery weeks apply either proportional volume cut across all zones, or **intensity shift** (Z3–Z5 reduced, Z1 boosted) per season recovery settings.

### Intensity: two models

| Model | Source | Pool behavior today |
|-------|--------|---------------------|
| **Intense day count** | Phases pane (`bikeIntenseDaysPerWeek`, etc.) | Splits remaining Z3–Z5 budget across N suggested interval cards |
| **Session role** | `PlannedSession.sessionRole` or future layout slot | Calendar ⚡ badge; **V2d** will filter library/suggested by selected day/session |

---

## Workout pool sections

### 1. Unscheduled (budget gap) — shipped

Derived from phase session counts minus scheduled `PlannedSession` per discipline (races excluded).

| Property | Behavior |
|----------|----------|
| Source | `max(0, budget − scheduled)` per discipline + strength |
| Placement | Drag chip onto day → creates flexible session |
| Combo | Drop library/suggested workout on chip → arm → drag to day (place + apply) |
| Anchors | Materialized anchor sessions reduce unscheduled counts |

### 2. Suggested (generated intervals) — shipped

Auto-generated from **remaining hard-zone minutes** (Z3–Z5) per discipline, split across `intenseDaysPerWeek`:

- One card per intense day per zone with budget
- Includes strides (run) and spin-ups (bike) priming cards
- Editable reps/duration on card before drag

**Not yet context-aware:** does not prioritize cards for a selected intensity day on the grid (V2d).

### 3. Structured workouts (library) — shipped

Browse `WorkoutFolder` / `WorkoutTemplate` tree. Discipline filter in pool header.

**Actions (shipped):**

- Drag template onto calendar day → create session + apply
- Drag onto existing session → `applyWorkoutTemplateToSession`
- Drop on unscheduled chip → combo flow (arm + place)
- Hard workout apply bumps `sessionRole` when session is still `MODERATE`

**V2d (next):** filter/boost threshold · VO2 · interval templates when selected day or session has `INTENSITY` role.

### 4. Week TiZ summary (footer) — shipped

Rollup of scheduled session zones vs `SeasonWeek.zoneMinutes` from the planner recompute.

**Today:** read-only progress via `week-summary.ts` + pool footer.

**V2e (next):** on placement or layout materialize, allocate session `targetZones` from role + discipline zone split percents for that week.

---

## TiZ target assignment

| When | How | Status |
|------|-----|--------|
| Planner recompute | Week `zoneMinutes` from volume × phase zone splits × recovery | **Shipped** (planner) |
| Apply structured workout | Roll up from workout steps; may bump `sessionRole` | **Shipped** |
| Manual edit | Session editor zone pills | **Shipped** |
| Place unscheduled chip | Inherit day context or open compact TiZ editor | V2e |
| Layout materialize | Default TiZ from slot `sessionRole` + week split percents | V2f + V2e |
| Long session placement | Pre-fill duration from `longRideMinutes` / `longRunMinutes`; role `LONG` | V2g |

**`zoneAllocationMissing`** flags sessions needing targets — candidate for pool sort/filter later.

---

## Session roles (shipped on calendar)

| Role | Visual | Typical TiZ skew (V2e target) |
|------|--------|--------------------------------|
| `easy` | Emerald accent | Higher Z1 share from split |
| `moderate` | Default | Phase split as-is |
| `intensity` | Amber + ⚡ | Z3–Z5 share from split |
| `long` | Violet accent | Z2 + duration from long-session ramp |

Roles are set manually on cards, inferred from title/workout, or (future) from layout materialize. Anchors should copy `sessionRole` when set.

---

## Phase layout (not built — still drives V2f)

Per-phase Mon–Sun grid (`SeasonPhaseLayoutItem`) remains the way to assign **which weekday** gets intensity vs long **before** workouts are picked. Athlete weekly template = import preset only.

Until V2f ships, the pool operates on **counts + calendar roles**, not weekday layout.

---

## Interaction flows

### A — Fill unscheduled swim (works today)

1. Pool shows **Swim ×1** (budget from Phases − scheduled)
2. User drags chip to Wednesday → flexible session
3. User drags suggested interval or library template onto session
4. Unscheduled count → 0

### B — Intensity week from planner (partial)

1. Phase says 2 bike intense days; week zone split includes Z4 budget
2. Pool **Suggested** shows ~2 bike interval cards with Z4 work
3. User places on calendar; sets role manually or via hard workout apply
4. **V2d:** selecting Friday's intensity slot would reorder/filter suggestions

### C — Recovery week (planner only today)

1. Recovery week flagged in weekly volume table
2. Week targets carry reduced hours + adjusted zone minutes
3. Pool suggested cards shrink accordingly (less hard-zone budget)
4. **Future:** pool header badge "Recovery week" when `isRestWeek`

### D — Long session (V2g — planned)

1. Weekly volume row shows `longRunMinutes: 90`
2. Pool suggests endurance template or unscheduled chip hint "Long run"
3. Placed session gets `sessionRole: LONG` + duration pre-filled

---

## Phased delivery

| Phase | Scope | Status |
|-------|--------|--------|
| **V2a** | Unscheduled chips; drag to day | **Shipped** |
| **V2b** | Library browse; drag to day/session | **Shipped** |
| **V2b+** | Combo drops (chip + library/suggested) | **Shipped** |
| **V2c** | `sessionRole` visuals; template item roles | **Shipped** |
| **V2d** | Library/suggested filtered by selected day + intensity context | **Next** |
| **V2e** | Session TiZ from role + week zone split percents on placement | **Next** |
| **V2f** | Phase week layout + `materializeSeasonWeek` | **Next** |
| **V2g** | Long-session hints from `longRideMinutes` / `longRunMinutes` | **Next** |

---

## Recommended implementation order (pool)

| # | Work | Depends on |
|---|------|------------|
| 1 | **V2d** — pass `selectedDateKey` + day session roles into library/suggested ranking | Calendar selection (exists) |
| 2 | **V2g** — expose `longRideMinutes` / `longRunMinutes` on `CalendarWeekTarget`; LONG suggestions | Planner fields on `SeasonWeek` |
| 3 | **V2e** — `allocateSessionZones(role, discipline, weekSplitPercents, weekZoneMinutes)` on create/place | Zone split types |
| 4 | **V2f** — layout materialize; combo with V2e for placeholder TiZ | `SeasonPhaseLayoutItem` schema |
| 5 | Recovery week badge + copy in pool when `isRestWeek` | Week targets (exists) |

---

## Decisions (confirmed)

| Item | Choice |
|------|--------|
| Sidebar position | **Left** |
| Session role | **Enum** `easy \| moderate \| intensity \| long` |
| Week zone budget source | **Computed** from phase zone split percents × volume (not manual week pills) |
| Intense day cardinality | **Phase pane counts** → suggested card count |
| Intensity weekday | **Layout (future)** or manual `sessionRole` on calendar |
| Planner | **Single `/plan` surface**; retired advanced wizard |
| Anchors | **In planner**; materialize to calendar; count as scheduled |

## Open items

- [ ] Tabs (Unscheduled | Suggested | Library | TiZ) vs one scrollable list
- [ ] Tag or folder metadata for library intensity filtering (threshold, VO2, …)
- [ ] Brick / multisport slots (future)
- [ ] "Needs TiZ" filter in pool (`zoneAllocationMissing`)
