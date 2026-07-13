# Calendar workout pool — V2 spec

**Status:** V2a/V2b shipped (unscheduled, suggested, library, week TiZ). Layout uses **one focused-week sticky sidebar** on `/calendar` (not a copy inside every week row). Complements [plan-wizard-weekly-template-strategy.md](./plan-wizard-weekly-template-strategy.md). **Future UX:** [workout-pool-wizard-wireframe.md](./workout-pool-wizard-wireframe.md) (sticky top wizard).

**Confirmed UX:** Workout pool lives in a **left sidebar** on the calendar, bound to the **focused week** (scroll position, Jump to week, or day selection). Collapsible; below `xl` opens as a drawer (collapsed by default). **Session role** uses enum `easy | moderate | intensity | long` (not a boolean intensity flag) — deferred to V2c. Tabs vs single scrollable list — **TBD** (currently one scrollable list with section headers).

**Budget source today:** Active **simple planner** season week targets (`getCalendarWeekTargets`), not the legacy multi-step wizard layout materializer.

---

## Purpose

After season planning sets weekly session budgets (and later a phase layout on the grid), the athlete still needs to:

1. **Place** sessions that aren’t on the calendar yet but are in the weekly budget (unscheduled)
2. **Choose** concrete structured workouts from suggestions or the library
3. **Assign TiZ targets** (time-in-zone budgets) per session — aligned with season/week zone plans

The **workout pool** sidebar is the hub for **(1) and (2)**. TiZ **(3)** is coupled but happens mainly on placement or in the session editor (V2d+).

**Out of scope:** Auto-inserting sessions to fill the pool without user action.

---

## Calendar layout (V2)

```
┌──────────────────┬─────────────────────────────────────────────┐
│  Workout pool    │  Multi-week scroll (focused week ringed)    │
│  (one sidebar)   │  · Week of …                                │
│  Focused · Mon d │  · Mon–Sun day columns                      │
│                  │  · Drop targets for pool items              │
│  ─ Unscheduled ─ │                                             │
│  Swim ×1         │  (pool is NOT repeated inside each week)    │
│                  │                                             │
│  ─ Suggested ─   │                                             │
│  interval cards  │                                             │
│                  │                                             │
│  ─ Library ─     │                                             │
│  [folder tree]   │                                             │
│                  │                                             │
│  ─ Week TiZ ─    │                                             │
│  budget vs done  │                                             │
└──────────────────┴─────────────────────────────────────────────┘
```

Sidebar is **week-scoped**: the focused week updates unscheduled counts, suggested workouts, library context, and week zone rollup. Week rows stay pool-free so multiple weeks fit in the viewport.

---

## Workout pool sections

### 1. Unscheduled (budget gap)

Derived from season week session counts minus scheduled `PlannedSession` per discipline (see strategy doc). Shown as **generic chips** — discipline label + count, not yet tied to a weekday.

| Property | Behavior |
|----------|----------|
| Source | `max(0, budget − scheduled)` per discipline |
| Placement | Drag chip onto a day column → creates flexible session (or fills empty layout slot) |
| After place | Chip count decrements; session may still need workout + TiZ |

**Scheduled sessions** on the calendar (all non-race `PlannedSession` sources—flexible, template, layout, or legacy rows) count toward the unscheduled budget. Races are excluded.

**Weekly template:** each item in `/calendar/template` has a **session role** (easy, moderate, intensity, long) with coaching definitions. Applying the template copies `sessionRole` onto each `PlannedSession` — same badges as manually placed skeletons.

Unscheduled items are **intentionally vague** (“1 swim”) until the athlete assigns structure and targets.

### 2. Suggested (hard-zone palette)

Auto-generated interval / priming cards from **remaining Z3–Z5 budget** vs already-planned session zones for the focused week. Editable before place; drag onto a day or session (or onto an unscheduled chip to arm it).

### 3. Structured workouts (library)

Browse `WorkoutFolder` / `WorkoutTemplate` tree (same library as workout builder). Filter by:

- Discipline (from sidebar context or selected day)
- Optional: **intensity day** — when dropping onto a slot flagged Z3+, prefer or filter templates tagged threshold / VO2 / interval (V2c+)

**Actions:**

- Drag template onto calendar day → `applyWorkoutTemplateToSession` (creates or updates session + `StructuredWorkout`)
- Drag onto unscheduled chip → place + apply in one gesture
- Click day session → “Change workout” opens pool with discipline pre-filtered (later)

Structured workouts may **bring their own** implied TiZ from step rollup; user can override with explicit TiZ assignment.

### 4. Week TiZ summary (sidebar footer or subsection)

Rollup of `targetZones` across scheduled sessions in the week vs week zone minutes. Read-only progress in V2a; interactive “distribute remaining Z2” in later iteration (V2e).

---

## TiZ target assignment (V2 — deferred V2d+)

Separate but coupled to the pool: every placed session should be able to carry a **TiZ budget** (`PlannedSession.targetZones`).

| When | How |
|------|-----|
| Layout materialize | Default TiZ from slot role + week zone split (easy slot → mostly Z1–2; intensity slot → Z3+) |
| Place unscheduled chip | Open compact TiZ editor or inherit day slot role if dropped on flagged day |
| Apply structured workout | Roll up from workout steps; merge or replace manual TiZ pills |
| Manual edit | Existing planned session editor zone pills |

**`zoneAllocationMissing`** (already on model) flags sessions that need targets — pool can sort/filter “needs TiZ”.

V2 zone allocation wizard step would set **week-level** zone minutes by discipline; the pool + per-session editor **allocates down** to sessions.

---

## Intensity days on phase layout (wizard → calendar) — deferred V2c

Phase layout slots (and optionally anchors) carry a **session role** flag — not a full zone prescription, but a planning hint:

| Role | Meaning | Calendar UX | Default TiZ skew |
|------|---------|-------------|------------------|
| `easy` | Recovery / aerobic | Normal card | Z1–2 |
| `moderate` | Steady endurance | Normal card | Z2 |
| **`intensity`** | **Zone 3+ expected** | **Visual flag** (accent border, bolt icon, etc.) | Z3–5 |
| `long` | Long aerobic | Long badge | Z2 (+ duration from step 4 ramp) |

**User language:** “Intensity day” = this weekday/discipline slot is where hard work belongs.

### Why on the template/layout, not just the workout

- Week grid shows **where** quality happens before workouts are picked
- Pool can suggest interval/threshold templates on intensity slots
- TiZ week rollup can expect more Z3+ on flagged days
- Coaches scan the week shape without opening every session

### Schema sketch (when layout ships)

On `SeasonPhaseLayoutItem` (name TBD):

```typescript
sessionRole: "easy" | "moderate" | "intensity" | "long"  // default "moderate"
// optional: targetZones preset override (V2+)
```

**Confirmed:** use this enum (not `isIntensityDay` boolean) so **long** sessions get distinct handling from **intensity** (Z3+) days.

---

## Interaction flows

### A — Fill unscheduled swim

1. Sidebar shows **Swim ×1** for the focused week
2. User drags to Wednesday
3. Session created (flexible); if Wed slot is **intensity** (V2c), default TiZ skews Z3+
4. User picks structured workout from pool or sets TiZ manually
5. Unscheduled swim count → 0

### B — Apply library or suggested workout

1. Focus a week (scroll or Jump to week)
2. Drag a suggested card or library template onto a day (or onto an unscheduled chip, then to a day)
3. Structured workout applied; TiZ may roll up from steps

### C — Intensity day without workout yet (V2c)

1. Friday run slot materialized with **intensity flag** visible
2. Session has placeholder title + default intensity TiZ split from week budget
3. `zoneAllocationMissing` false if defaults applied; workout still optional until library assign

---

## Relation to season planning

| Source | Feeds pool |
|--------|------------|
| Simple planner week targets | Unscheduled **counts** (session budget) + zone minutes |
| Calendar template / manual sessions | **Scheduled** counts (reduces unscheduled) |
| Workout library | Library section |
| Remaining hard-zone budget | Suggested section |
| Future phase layout (V2c) | Grid + intensity flags |
| Future zone allocation (V2e) | Week TiZ **budget** interactivity |

---

## Phased delivery

| Phase | Scope | Status |
|-------|--------|--------|
| **V2a** | Unscheduled chips; drag to day; week count math | Shipped |
| **V2b** | Library (+ Suggested); drag to day/session; focused-week sidebar | Shipped |
| **V2c** | Layout `sessionRole` + intensity visual on calendar; default TiZ on materialize | Deferred |
| **V2d** | TiZ assign UI in pool placement flow; week zone budget vs actual | Deferred |
| **V2e** | Zone allocation wizard + distribute week zones to sessions | Deferred |

---

## Decisions (confirmed)

| Item | Choice |
|------|--------|
| Sidebar position | **Left** (sticky on `xl+`; drawer below `xl`) |
| Sidebar instances | **One** shared pool for the focused week — not per week row |
| Session role | **Enum** `easy \| moderate \| intensity \| long` (V2c) |
| Suggested workouts | **Kept** as a first-class pool section |
| Pool layout | **Single scrollable list** with section headers for now; tabs still TBD |

## Open items

- [ ] Tabs (Unscheduled \| Suggested \| Library \| TiZ) vs one scrollable list with section headers
- [ ] Brick / multisport slots (future)
