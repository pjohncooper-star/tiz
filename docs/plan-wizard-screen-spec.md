# Plan wizard — screen spec (v2)

> **⚠️ SUPERSEDED (July 2026).** Specs a **5-step wizard** and **anchor workouts** that were never built (wizard) or dropped (anchors). Production season planning is the single-page **Simple Planner**. Retained for history only. See [plan-wizard-weekly-template-strategy.md](./plan-wizard-weekly-template-strategy.md) for the current direction.

User-directed flow after cycle structure: **goals & days → workouts/anchors → volume/ramp/de-load**. Zone allocation deferred to V2.

**Wireframe:** [plan-wizard-wireframe.canvas.tsx](file:///C:/Users/pjohn/.cursor/projects/c-Users-pjohn-TiZ/canvases/plan-wizard-wireframe.canvas.tsx)

Legend: **P0** v1 redesign · **P1** follow-up · **V2** later · **OOS** out of scope

---

## Wizard steps (5 steps, 0–4)

| # | Label | `SETUP_STEPS` (proposed) |
|---|-------|--------------------------|
| 0 | Season setup | `Season setup` |
| 1 | Cycle structure | `Cycle structure` |
| 2 | Phase goals & training days | `Goals & training days` |
| 3 | Workouts & templates | `Workouts & templates` |
| 4 | Volume, ramp & de-load | `Volume, ramp & de-load` |

**V2 (post-setup):** Zone allocation by discipline — new settings section or step 5 when ready.

---

## Global chrome

| Element | Spec |
|---------|------|
| Stepper | 5 steps; highlight current |
| Actions | Back, **Save & continue**, **Finish plan** on step 4 |
| Save | Incremental `patchSeason` per step (remap `saveStep` indices) |
| Settings | Remap `SETTINGS_SECTIONS` slugs to match |

### Proposed settings slugs

| Slug | Step | Label |
|------|------|-------|
| `dates` | 0 | Season setup |
| `cycle` | 1 | Cycle structure |
| `goals` | 2 | Goals & training days |
| `workouts` | 3 | Workouts & templates |
| `volume` | 4 | Volume, ramp & de-load |
| ~~`deload`~~ | — | merged into `volume` |
| ~~`focus`~~ | — | merged into `goals` |

---

## Step 0 — Season setup (P0)

Same as v1 spec: two columns, A race required, B/C accordion, calendar import callout.

**Save:** `name`, dates, goal events, link calendar races.

---

## Step 1 — Cycle structure (P0)

Same as v1 spec: timeline + master–detail phase/mesocycle editor.

**Save:** `mesocycleLengthWeeks`, `phases` (structure only — no focus/volume fields on this step).

---

## Step 2 — Phase goals & training days (P0)

**Purpose:** For each macro phase, define *what you're training toward* and *how many days per discipline*.

**Layout:** Table — one row per phase.

| Column | Control | Maps to today |
|--------|---------|---------------|
| Phase | Name + kind pill | — |
| Goal / focus | Phase focus OR per-discipline focus (mode toggle) | `focusMode`, `phaseFocus`, `disciplineFocuses` |
| Swim days | 0–7 int | `swimSessionsPerWeek` |
| Bike days | 0–7 int | `bikeSessionsPerWeek` |
| Run days | 0–7 int | `runSessionsPerWeek` |

**Helper:** “Weekly session **budget** per discipline — you’ll place workouts on the calendar later; unscheduled sessions show there if the week isn’t full.”

**Save:** `phases` (focus + session counts).

**OOS v1:** Zone % columns (→ V2). **No validation** that step 3 layout matches these counts.

**Error:** Days sum unusually high → soft warning only.

---

## Step 3 — Workouts & templates (P0)

**Purpose:** Define recurring anchor workouts and (later) per-phase week layout. Long-term: season-owned layout; athlete weekly template is import-only.

**Layout:**

| Zone | Content |
|------|---------|
| Scope | Segmented: **Whole season** \| **Per phase** (select phase when per-phase) |
| Primary | `AnchorEditor` list — title, discipline, weekday, duration, effective dates, `respectTaper`, optional `workoutTemplateId` |
| Secondary (collapsible) | Link to athlete weekly template on calendar; **P1+:** “Import preset” into phase layout |

**P0 — Athlete weekly template:**
- Link only: “Edit weekly template on calendar →” (`/calendar/template`) for off-season / preset editing.
- Layout on the season is **not** validated against step 2 session budgets.

**P1+ — Season phase layout:**
- Week grid editor per `SeasonPhase` (option 2 in [strategy doc](./plan-wizard-weekly-template-strategy.md)).
- Per-slot **session role** enum: `easy` | `moderate` | `intensity` | `long` — distinct handling for Z3+ vs long aerobic; visual on calendar V2c.
- Import copies athlete template into phase layout; no mismatch badges vs step 2.

**V2 calendar:** Sidebar **workout pool** — unscheduled chips + structured library + TiZ assignment. Layout slots may flag **intensity days** (Z3+). [calendar-workout-pool-v2.md](./calendar-workout-pool-v2.md)

**Save:** Anchor CRUD via existing `/api/plan/anchors` (already on `AnchorEditor`).

**Gating:** Requires `seasonId` — steps 0–1 already persist plan before step 3.

**OOS P0:** Embedded template editor, auto calendar fill for full season, phase-scoped template schema.

---

## Step 4 — Volume, ramp & de-load (P0)

**Purpose:** Weekly load targets, mesocycle stepping, long sessions, recovery weeks.

**Layout (top to bottom):**

### 4a Volume unit & totals

| Field | P0 | P1 |
|-------|-----|-----|
| Unit | Hours / week | Distance (km/mi) per discipline |
| Season start / peak | Yes | Same fields in distance unit |
| Reference pace / speed | — | Per discipline; rolls distance → weekly duration for `SeasonWeek`; volume gap on calendar V2+ |
| Per-discipline hours split | — | Explicit swim/bike/run hour targets (today: `DEFAULT_DISCIPLINE_SPLIT` from phase kind) |

### 4b Phase volume table

Same as v1: mode + start/end hours per non-taper phase (`volumeMesocycleMode`, etc.).

### 4c Long week schedule

Presets + `LongSessionWeekChart`.

### 4d De-load (collapsible, default open)

| Field | Maps to |
|-------|---------|
| `DeLoadWeekChart` | week flags |
| Every N weeks, volume %, strategy, reduce counts | existing fields |

**Save:** `startHours`, `peakHours`, long mins, phase volume fields, long week flags, all de-load fields, `setupComplete: true` on finish.

**Removed:** `maxRampPercent` from UI and save.

---

## V2 — Zone allocation by discipline (OOS v1)

**Purpose:** Explicit Z1–Z5 (or zone minutes) per discipline per phase or week — replaces or supplements focus→TIZ preset.

**Depends on:** Step 4 per-discipline volume hours.

**Surface:** New settings section + optional wizard step 5 later.

**Today:** [`focus-tiz.ts`](../src/lib/plan/season/focus-tiz.ts) derives zones from `phaseFocus`; keep until V2 ships.

---

## Review checklist

- [ ] Step order 2 → 3 → 4 matches coaching mental model
- [ ] Days per discipline on step 2 (not step 5)
- [ ] Anchors step 3 with season vs phase scope
- [x] Per-discipline hours — P1
- [x] Distance volume + pace rollup — P1
- [x] Weekly layout: option 2 — season-owned; unscheduled workouts on calendar V2
- [ ] De-load inside volume step acceptable
- [ ] Zone allocation explicitly V2
