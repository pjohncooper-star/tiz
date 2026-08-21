[← Guide index](./README.md)

# 5. The season planner

The season planner answers one question: **how much of what, in which week, between now and my race.** It does not schedule individual workouts — that is the calendar's job. It produces weekly targets: hours per sport, minutes per zone, how many sessions, and how long the long ride and long run should be.

Open it from **Seasons** in the sidebar. Existing seasons are listed at `/plan/seasons`.

The planner is intentionally **volume-first**. You describe the shape of the season, save with recalculate, and the planner computes every week. Then you either **materialize** those weeks into calendar sessions, or fill them in by hand from the [workout pool](./06-planning-calendar.md#the-workout-pool).

## Creating a season

With no season yet, the page shows a short create form:

| Field | Default |
| --- | --- |
| **Season name** | The current year, for example `2026 Season` |
| **Start date** | Today |
| **End date** | Six months out |

Press **Create season**.

Some things happen automatically:

- Start snaps back to a **Monday** and end forward to a **Sunday**, because every week in TiZ is Monday-start.
- The week count is computed from the range.
- **No phases are created.** A new season is a blank set of weeks; you add structure next.
- A default volume ramp is applied per sport: swim 2 → 4 hours, bike 4 → 8, run 2 → 4, at 5% growth per week.
- Every fourth week is marked as a **rest week** at 75% of the previous week's volume.
- Long-session anchors are seeded: long ride 60 → 180 minutes, long run 30 → 90.
- Planning mode defaults to **By discipline**.

The season's status is derived from its dates: **draft** if it starts more than four weeks out, **active** once it is within four weeks, **completed** after the end date. Seasons cannot overlap.

## The layout

At the top is a sticky **volume timeline** — the chart you will look at most. Below it, collapsible sections in the order you generally work through them:

| Section | Purpose |
| --- | --- |
| **Season** | Name, dates, default planning mode |
| **Races** | Your A, B, and C races |
| **Program** | Optionally attach a program from your library |
| **Phases** | The real work: blocks, volume, zone focus, long sessions |
| **Season defaults** | Zone focus per phase kind, hours-vs-distance planning units |
| **Week review** | The week-by-week table, rest and test weeks |

Each section has its own **Save** and **Cancel**; **Save all** at the top saves everything. Sections that change computed volume say **Save & recalculate** instead, and the timeline shows "Live preview — Save & recalculate to persist volume" while you have unsaved edits.

Also at the top: **Programs** (to the library), **All seasons**, and, when ECO load is enabled, a **Fitness / fatigue (season TiZ → ECO)** card that projects your PMC curve from the season you are drafting.

### The volume timeline

One bar per week, height proportional to hours, stacked by sport — swim, bike, run. Below the bars:

- A **coloured band** naming the phase each week belongs to.
- A **violet band** for weeks covered by an attached program, dashed where you paused it.
- **A/B/C race badges** on the weeks your races fall in.
- Month labels along the axis.

Controls: **Show volume** / **Hide volume**, and filters for **All**, **Swim**, **Bike**, **Run**. Clicking a week scrolls the Week review table to it.

This is the chart to check when you are asking "does this season look right" — you are looking for a sane progression, rest weeks that actually dip, and a taper that actually tapers.

## Races

Each race block is labelled **A-race**, **B-race**, or **C-race** — the conventional priority system, where the A-race is what the season is built around.

| Field | Notes |
| --- | --- |
| **Name** | Required for the A-race |
| **Date** | Required for the A-race |
| **Disciplines** | Swim / Bike / Run toggles. The A-race defaults to all three; B and C default to run only. |

**Add B race** and **Add C race** add more; **Remove** deletes them.

Races appear on the timeline as badges (A red, B amber, C grey) and, when you save, are synced onto your **calendar** as race sessions. They are also what the **End on race** option in the Program section anchors to.

**Known limitation:** goal times per race are supported in the data model and used for calendar race durations, but the Races section here has no goal-time fields. You can set a goal time when creating a race directly on the calendar instead.

## Phases

A **phase** is a named block of consecutive weeks with its own volume progression, zone focus, session counts, and optional weekly template. This is where a season gets its shape.

Phase chips run along the top. Assigned phases show their name and week range; new ones show "Not assigned"; an **Unassigned** chip shows weeks not yet covered by any phase.

Press **+ Add phase** to create one, or hover an unassigned week's gutter in Week review and press **+** to make a one-week phase there.

### Phase kinds

| Kind | Typical role |
| --- | --- |
| **Base** | Aerobic volume, low intensity |
| **Build** | Adding threshold and race-relevant intensity |
| **Race prep** | Race-specific work, volume steady or trimmed |
| **Taper** | Volume drops, intensity kept sharp |

The kind is not just a label: it selects the default zone focus and discipline split for the phase. Typing a name like "Base 2" infers the kind for you.

A conventional long season is something like Base → Base 2 → Build → Race prep → Taper; a short one collapses to Base → Build → Taper. The planner suggests proportions of roughly 35% base, 35% build, 15% race prep, 10% taper for seasons under 26 weeks, and blocks of 8 + 8 + 8 + 2 weeks with extra base blocks prepended for longer ones. You are free to ignore that entirely.

### Phase settings

| Control | What it does |
| --- | --- |
| **Phase kind** | Base / Build / Race prep / Taper |
| **Label** | The phase name shown on the timeline |
| Colour picker | The band colour on the timeline |
| **Planning mode** | Season default, or an override — see [planning modes](#planning-modes) |
| **Weekly template** | The Mon–Sun layout used when you generate sessions. Required to materialize. |
| **From week** / **To week** | Week range (on narrow screens; on desktop you drag the phase band's handles in Week review) |
| **Sessions per week** | Swim, Bike, Run, Strength counts. Defaults 3 / 4 / 3 / 2. |
| **Intense days per week** | Swim, Bike, Run — how many days carry Z3+ work. Default 1 each. |
| **Zone focus (TiZ %)** | The intensity distribution for the phase — see [zone focus](#zone-focus-and-tiz-targets) |
| **Phase volume** | The volume progression — see [volume](#volume-and-ramps) |
| **Long sessions** | **Long ride** and **Long run** settings, in the separate-long modes only |
| **Ramp by discipline** | Three checkboxes; unticking one holds that sport flat through the phase |
| **Phase goal** | A free-text note — "Optional focus for this phase" |
| **Delete phase** | Removes it |

Press **Save & recalculate** to persist and recompute weekly volume.

### Planning modes

The planning mode decides how volume and TiZ are grouped. Set a season default under **Season**, and override per phase if you want.

| Mode | What you manage |
| --- | --- |
| **Overall volume & TiZ** | One total hours target per week; the planner splits it across sports |
| **By discipline** (default) | Separate hours targets for swim, bike, and run |
| **Separate long workouts** | As above, but the long ride and long run are excluded from the main hours and ramp on their own schedule |
| **Separate long TiZ** | As above, and the long session's time in zone is tracked separately too |

The separate-long modes exist because the long ride and long run usually progress on a different logic from the rest of the week — you might hold weekly bike hours steady while pushing the long ride from two hours to four. In those modes, "Sessions per week" *includes* the long session.

### Volume and ramps

Under **Phase volume**, each sport gets a progression:

| Progression | Fields | Behavior |
| --- | --- | --- |
| **Target (start → end)** | **Start (h)**, phase end | Linear ramp between the two. Leave start blank to "Chain from prior phase" — it picks up where the previous phase ended. |
| **Percent / week** | Growth %, optional **Peak cap** | Compound weekly growth, capped |
| **Absolute step / week** | Hours added per week, optional **Peak cap** | Fixed increment, capped |

Chaining is the useful default: set the start for your first phase, then let each subsequent phase continue from the previous one's exit volume, so there are no discontinuities at phase boundaries.

**Rest weeks** interrupt the ramp. Under Week review, **Rest week volume** sets what a rest week gets as a percentage of the previous training week — 75% by default. Rest weeks are marked every fourth week when a season is created, and you can tick or untick the **Rest** checkbox on any week.

**Mesocycles** are the four-week blocks inside each phase. You do not edit them directly; the planner uses them to time de-load weeks, schedule long weeks, and step volume plateaus. They are also what the Dashboard's "This cycle" date range refers to.

### Zone focus and TiZ targets

A **zone focus** is a named intensity distribution — what share of the phase's hours sit in each zone. Rather than typing percentages every time, you pick a focus per sport per phase.

The seeded focuses, as Z1/Z2/Z3/Z4/Z5 percentages:

| Focus | Z1 | Z2 | Z3 | Z4 | Z5 |
| --- | --- | --- | --- | --- | --- |
| Aerobic base | 75 | 20 | 4 | 0.5 | 0.5 |
| Threshold | 50 | 30 | 15 | 4 | 1 |
| VO2 max | 45 | 25 | 20 | 8 | 2 |
| Race specificity | 55 | 25 | 12 | 6 | 2 |
| Freshness | 80 | 15 | 4 | 0.5 | 0.5 |
| Strength / power | 60 | 20 | 10 | 8 | 2 |
| Maintenance | 70 | 22 | 6 | 1 | 1 |

By default Base uses Aerobic base, Build uses Threshold, Race prep uses Race specificity, and Taper uses Freshness. You can change those defaults in **Season defaults**, ramp between two focuses across a phase, or set **Manual TiZ %** with sliders. Add and edit named focuses in **Settings → Training & planning → Zone focus**.

Hours × focus percentages give the phase's **TiZ target**: the minutes per zone per sport per week. That budget is what the calendar's workout pool spends when you schedule sessions.

**Intense days per week** determines how the Z3+ portion is concentrated. Two intense run days with 40 minutes of Z4 between them is a very different week from four days with 20 each, even though the TiZ total is identical.

### Long sessions

In the separate-long modes, each phase gets long-session controls:

| Control | Meaning |
| --- | --- |
| **Long ride** / **Long run**, start and end minutes | The ramp across the phase |
| **Off-week policy** | What happens on weeks without a full long session |
| **Endurance % of long** | Used by the percentage policy; default 60 |
| Long week schedule grid | Checkboxes per week for long bike and long run |

Off-week policies: **No substitute**, **Extra intensity day**, or **Endurance at % of long volume**. Rest weeks and taper weeks never carry a full long session.

An **off week** is a week without a full-length long session; that is different from a **rest week**, which cuts volume across the board.

## Season defaults

Collapsed by default. Two things live here:

**Phase kind zone defaults** — the zone focus applied to each phase kind (Base, Build, Race prep, Taper) per sport, used when creating new phases. A link points to **Settings** for managing the focus library itself.

**Planning units** — whether swim and run are planned in **hours** or **distance**, plus the **reference pace** used to convert between them. Bike is always hours. If you think in "60 km weeks" rather than "5 hour weeks", switch the run to distance and give it a reference pace.

## Week review

The week-by-week table, and where you make per-week adjustments.

| Column | Meaning |
| --- | --- |
| **Wk** | Week number |
| **Dates** | The Monday–Sunday range |
| **Test** | Mark this as a test week — it uses the test-week template when generating sessions |
| **Rest** | Mark this as a de-load week — volume drops to the rest-week percentage |
| **Total h** | Computed total hours |

Expanding a week shows each sport as `Xh · TiZ Ym (Z3 Zm)`. Badges mark weeks covered by an attached program (**Program**) and weeks where you paused it (**Paused**).

**Rest week volume** and **Save & recalculate volume** sit above the table. On desktop, phase bands in the left gutter can be dragged by their top and bottom handles to resize phases.

## Generating sessions (materialize)

**Materializing** turns a phase's weekly template and volume targets into actual planned sessions on your calendar. Until you do this — or place sessions by hand — the calendar is empty even though the season is fully planned.

Each phase has a **Generate sessions for this phase** panel:

| Control | Meaning |
| --- | --- |
| **Only fill weeks with no existing sessions** | On by default. Skips any week that already has planned sessions. |
| **Generate sessions** | Runs it |

Two prerequisites: the phase must be **assigned to weeks**, and it must have a **weekly template**. Without them you get "Assign this phase to weeks and choose a weekly template before generating." A phase you just added must be saved first.

What generation does:

- Creates planned sessions for every week in the phase from the phase's weekly template.
- Uses your **rest week template** for rest weeks and **test week template** for test weeks (both set at the top of the Phases section).
- Rewrites long-session slots according to the long-week checkboxes and off-week policy.
- Avoids colliding with sessions from an attached program.
- With the checkbox **off**, it replaces previously generated sessions in those weeks while leaving sessions you created by hand alone.

You get a confirmation like "Created 48 sessions across 8 weeks in Base 2".

The generated sessions are skeletons — the right sport, day, role, and duration, with no structured workout attached. Building the actual workouts is [chapter 6](./06-planning-calendar.md) and [chapter 7](./07-workout-library.md).

## Attaching programs

You can attach several library programs to one season. Windows may overlap (a swim program beside a run program, or two copies of the same program on different dates). Build each program once in the library (see [chapter 7](./07-workout-library.md#programs)), then attach it here with **Add program**.

| Control | What it does |
| --- | --- |
| **Add program** | Attach another library program (same program twice is allowed) |
| **Anchor** | **Start date** or **End date**, independently per program |
| **End on race** | Anchors that program's end to one of your races |
| **Owns hours / TiZ** | Sports whose week targets come from this program. Uncheck to keep season-ramp targets while still placing those sessions on the calendar |
| **Fill leftover** | Optional: put leftover season minutes onto extra days. Off by default — the program is the target |
| **Pause selected week** | Skips that program for the selected week — holidays, illness, travel |
| **Pause all programs this week** | Vacation: skip every attached program that week |
| **Remove** | Detaches that program only; future season-stamped sessions go with it. Unattached library copies of the same program stay. |
| **Save & apply** | Persists attachments and recalculates |

Attached program weeks appear as colored bars on the timeline (one bar per program); paused weeks are dashed. Same-day same-sport overlaps warn with **Prefer A**, **Prefer B**, or **Keep both**. Save is allowed either way.

Calendar cards mark season-attached sessions with **· season** so you can tell them from a library apply of the same program. If you already ran the program from the library, adding it here offers to **use those existing sessions** instead of duplicating them.

For sports a program owns that week, the program **is** the hours/TiZ target — not a floor against the season ramp. Session counts follow that week of the program unless leftover-TiZ is on (or you raised hours). Checking **Rest** offers to pause attached programs too; rest by itself does not skip them.

Pausing a week skips that program without editing the library, then resumes after the hole. End-anchored programs keep their race date.

## Managing seasons

`/plan/seasons` lists every season with its name, dates, week count, total planned hours, and status. **Archive** removes one after a confirmation.

To work on a specific season, open it from this list.

## Messages you may see

| Message | Meaning |
| --- | --- |
| "Live preview — Save & recalculate to persist volume" | You have unsaved volume edits |
| "Assign this phase to weeks and choose a weekly template before generating." | Materialize prerequisites are missing |
| "Save the Phases section to persist this phase before generating sessions." | The phase has not been saved yet |
| "Created N sessions… (skipped M with existing sessions)" | Materialize skipped already-populated weeks |
| A season overlap error | Your dates collide with another season |

---

Next: [6. The planning calendar →](./06-planning-calendar.md)
