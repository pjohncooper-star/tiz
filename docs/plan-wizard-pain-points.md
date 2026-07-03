# Plan wizard — pain points & proposed flow

Baseline audit of live wizard in [`season-settings-panels.tsx`](../src/components/season/season-settings-panels.tsx).

**Wireframe v2** reflects user-directed step order (July 2026). v1 wireframe reordered layout only; v2 reorders *what you configure when*.

---

## Proposed wizard flow (v2)

Natural progression after defining the calendar skeleton:

```mermaid
flowchart LR
  S0["0 Season setup"]
  S1["1 Cycle structure"]
  S2["2 Goals and training days"]
  S3["3 Workouts and templates"]
  S4["4 Volume ramp deload"]
  V2["V2 Zone allocation"]
  S0 --> S1 --> S2 --> S3 --> S4
  S4 -.-> V2
```

| Step | Name | What the athlete defines |
|------|------|---------------------------|
| **0** | Season setup | Dates, A/B/C races, calendar import |
| **1** | Cycle structure | Macro phases, mesocycles, timeline |
| **2** | Phase goals & training days | **Per phase (cycle):** training focus/goals + **days per discipline** (swim/bike/run frequency) |
| **3** | Workouts & templates | **P0:** anchors. **P1+:** season phase layout (import from athlete template). **V2 calendar:** unscheduled workouts when budget > scheduled |
| **4** | Volume, ramp & de-load | **P0:** weekly hours, phase ramp, long sessions, de-load. **P1:** per-discipline hours; distance volume with pace/speed → duration rollup |
| **V2** | Zone allocation | **Hours/minutes by zone per discipline** — replaces implicit focus→TIZ presets as primary UX |

### Why this order

1. **Structure first** — phases/mesocycles bound everything else.
2. **Intent & frequency** — what each block is for and how many swim/bike/run days before picking specific workouts.
3. **Anchors/templates** — concrete recurring sessions that fill those days.
4. **Load** — how much volume, how it ramps, when to de-load (depends on structure + session picture).
5. **Zones** — finer distribution once volume by discipline exists (V2).

### Mapping from current (6-step) wizard

| Current step | Current content | v2 home |
|--------------|-----------------|---------|
| 0 Season setup | dates, races | **0** (unchanged) |
| 1 Cycle structure | phases, mesos | **1** (unchanged) |
| 2 De-load cadence | chart + rules | **4** (merged with volume) |
| 3 Goals & focus | phase/discipline focus | **2** (goals); zones → **V2** |
| 4 Volume & ramp | hours, phase ramp, long weeks | **4** |
| 5 Workouts / week | session counts + anchors | **2** (days/discipline) + **3** (anchors) |

---

## Cross-cutting issues (still valid)

| Issue | Detail |
|-------|--------|
| **Step order** | De-load and volume before goals/anchors felt backwards; v2 fixes. |
| **Density** | Step 4 (old) crowded; v2 splits anchors and merges deload with volume in one *thematic* step with collapsibles. |
| **Anchors buried** | Anchors only on step 5 after season exists; v2 promotes to dedicated step 3. |
| **Weekly template** | Athlete template on calendar = import preset; **season phase layout** owns the grid; gaps → unscheduled workouts (V2 calendar). |
| **Zone UX** | Today: `focus-tiz` presets from phase focus at recompute time; user wants explicit zone allocation by discipline (V2). |
| **Dead settings** | `maxRampPercent` hidden and unused — remove from UI permanently. |

---

## Per-step pain points (current code)

### Step 0 — Season setup
Long scroll; B/C repetitive; calendar import at bottom.

### Step 1 — Cycle structure
Timeline good; stacked phase cards duplicate preview; mesocycle editing buried.

### Step 2 — De-load (moving to step 4)
Chart good; settings feel disconnected from volume.

### Step 3 — Goals & focus (moving to step 2)
Per-phase cards repetitive; conflates *training goal* with *zone mix* (latter → V2).

### Step 4 — Volume & ramp (moving to step 4, + deload)
Global + per-phase fields + long-week chart — too dense; no per-discipline volume entry yet.

### Step 5 — Workouts / week (split to 2 + 3)
Session counts are really **days per discipline**; anchors mixed with frequency setup.

---

## v2 IA decisions (wireframe)

1. **Days per discipline** on step 2 (not a separate “workouts per week” step).
2. **Anchors + weekly template** on step 3 with scope toggle: season | phase.
3. **Volume step** — P0: total hours + phase ramp + long sessions + de-load. **P1:** per-discipline hours; distance-based volume with reference pace/speed to roll up to weekly duration.
4. **De-load** collapsible section inside step 4 (not its own wizard step).
5. **Zone allocation** — documented as V2; finish wizard after step 4.
6. **Settings parity** — `/plan/settings/*` sections remap to new step indices.
7. **Weekly template** — P0: link-only; long-term: season phase layout ([strategy doc](./plan-wizard-weekly-template-strategy.md)).

### Confirmed (July 2026)

| Decision | Choice |
|----------|--------|
| Per-discipline hours (step 4) | **P1** |
| Distance-based volume (step 4) | **P1** — use avg pace/speed to convert distance ramps → weekly duration |
| Weekly template (step 3) | **Option 2** — season phase layout; no budget validation; V2 unscheduled on calendar |
| Zone allocation | **V2** |
