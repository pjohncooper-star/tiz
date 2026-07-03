# Calendar workout pool — V2 spec

**Status:** Direction doc (not implemented). Complements [plan-wizard-weekly-template-strategy.md](./plan-wizard-weekly-template-strategy.md).

**Confirmed UX:** Workout pool lives in a **left sidebar** on the calendar week view. **Session role** uses enum `easy | moderate | intensity | long` (not a boolean intensity flag). Tabs vs single scrollable list — **TBD**.

---

## Purpose

After season layout materializes onto the calendar, the athlete still needs to:

1. **Place** sessions that weren’t on the phase grid but are in the weekly budget (unscheduled)
2. **Choose** concrete structured workouts from the library
3. **Assign TiZ targets** (time-in-zone budgets) per session — aligned with season/week zone plans

The **workout pool** sidebar is the hub for (1) and (2); TiZ assignment happens on placement or in-session (3).

---

## Calendar layout (V2)

```
┌──────────────────┬─────────────────────────────────────────────┐
│  Workout pool    │  Week grid (Mon–Sun)                        │
│  (left sidebar)  │  · Scheduled sessions (layout + anchors)    │
│                  │  · sessionRole visual (intensity, long)     │
│  ─ Unscheduled ─ │  · Drop targets for pool items              │
│  Swim ×1         │                                             │
│  Bike ×1         │                                             │
│                  │                                             │
│  ─ Library ─     │                                             │
│  [folder tree]   │                                             │
│                  │                                             │
│  ─ Week TiZ ─    │                                             │
│  budget vs done  │                                             │
└──────────────────┴─────────────────────────────────────────────┘
```

Sidebar is **week-scoped**: switching calendar weeks updates unscheduled counts, library context, and week zone rollup.

---

## Workout pool sections

### 1. Unscheduled (budget gap)

Derived from `SeasonWeek` session counts minus scheduled `PlannedSession` per discipline (see strategy doc). Shown as **generic chips** — discipline label + count, not yet tied to a weekday.

| Property | Behavior |
|----------|----------|
| Source | `max(0, budget − scheduled)` per discipline |
| Placement | Drag chip onto a day column → creates flexible session (or fills empty layout slot) |
| After place | Chip count decrements; session may still need workout + TiZ |

Unscheduled items are **intentionally vague** (“1 swim”) until the athlete assigns structure and targets.

### 2. Structured workouts (library)

Browse `WorkoutFolder` / `WorkoutTemplate` tree (same library as workout builder). Filter by:

- Discipline (from sidebar context or selected day)
- Optional: **intensity day** — when dropping onto a slot flagged Z3+, prefer or filter templates tagged threshold / VO2 / interval

**Actions:**

- Drag template onto calendar day → `applyWorkoutTemplateToSession` (creates or updates session + `StructuredWorkout`)
- Drag onto unscheduled chip → place + apply in one gesture
- Click day session → “Change workout” opens pool with discipline pre-filtered

Structured workouts may **bring their own** implied TiZ from step rollup; user can override with explicit TiZ assignment.

### 3. Week TiZ summary (sidebar footer or subsection)

Rollup of `targetZones` across scheduled sessions in the week vs `SeasonWeek.zoneMinutes` (or V2 custom zone allocation). Read-only progress in V2a; interactive “distribute remaining Z2” in later iteration.

**Today:** `week-summary.ts` + session `targetZones`; season `zoneMinutes` on `SeasonWeek` from `focus-tiz.ts`. V2 zone allocation step would feed the week budget explicitly.

---

## TiZ target assignment (V2)

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

## Intensity days on phase layout (wizard → calendar)

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

Anchors may reuse `sessionRole` or infer `long` from duration/title when not set explicitly.

### Wizard step 3 (P2+)

Phase layout editor: toggle **intensity day** per slot (checkbox or role dropdown). No validation against zone allocation — same philosophy as session counts.

---

## Interaction flows

### A — Fill unscheduled swim

1. Sidebar shows **Swim ×1**
2. User drags to Wednesday
3. Session created (flexible); if Wed slot is **intensity**, default TiZ skews Z3+
4. User picks structured workout from pool or sets TiZ manually
5. Unscheduled swim count → 0

### B — Replace placeholder layout session

1. Tuesday shows “Bike endurance” from layout (moderate)
2. User opens pool → drags “2×20 threshold” onto Tuesday
3. Structured workout applied; TiZ rolled up from template

### C — Intensity day without workout yet

1. Friday run slot materialized with **intensity flag** visible
2. Session has placeholder title + default intensity TiZ split from week budget
3. `zoneAllocationMissing` false if defaults applied; workout still optional until library assign

---

## Relation to wizard steps

| Wizard | Feeds pool |
|--------|------------|
| Step 2 | Unscheduled **counts** (session budget) |
| Step 3 | **Grid** + **intensity flags** + anchors |
| Step 4 | Duration hints, long session tiers |
| V2 zones | Week TiZ **budget** in sidebar footer |

---

## Phased delivery

| Phase | Scope |
|-------|--------|
| **V2a** | Sidebar: unscheduled chips; drag to day; week count math |
| **V2b** | Library browse in sidebar; drag template to day |
| **V2c** | Layout `sessionRole` + intensity visual on calendar; default TiZ on materialize |
| **V2d** | TiZ assign UI in pool placement flow; week zone budget vs actual |
| **V2e** | Zone allocation wizard + distribute week zones to sessions |

---

## Decisions (confirmed)

| Item | Choice |
|------|--------|
| Sidebar position | **Left** |
| Session role | **Enum** `easy \| moderate \| intensity \| long` |
| Pool layout | **TBD** — tabs vs single scrollable list |

## Open items

- [ ] Tabs (Unscheduled \| Library \| TiZ) vs one scrollable list with section headers
- [ ] Brick / multisport slots (future)
