[← Guide index](./README.md)

# 6. The planning calendar

The calendar is where a season becomes a schedule. It shows planned sessions and completed activities side by side, week after week, and it is where you spend the week's session budget, attach structured workouts, link what you actually did, and export workouts to your device.

Open **Calendar** in the sidebar.

> *"Scroll up for past weeks and completed sessions, or down for upcoming weeks. Drag sessions between days and apply your weekly template."*

## Layout

### The toolbar

Sticky at the top while you scroll.

| Control | What it does |
| --- | --- |
| **Today** | Jump to today |
| **Jump to** + date field | Scroll to a specific date |
| **Search** | Toggle the training-history search pane |
| **Browse calendar** | A month picker for jumping further afield (wider screens) |
| **Workout pool** | Toggle the week's session budget panel |
| **Next unplanned week** | Shown with the pool open; jumps to the next week with budget left |
| **Upload** | Upload a `.fit`, `.gpx`, or `.tcx` file |
| **Apply template** | Drop a weekly template onto a week |
| **Save week as program** | Capture a date range as a reusable program |
| **Programs** | Link to the program library |
| **Edit weekly template** | Link to the weekly template library |
| **Workout builder** | Open the structured-workout builder pane |

The month picker's hint: *"Pick any day to jump there (week Mon–Sun). Click the month or year header to zoom out to months or years."*

### Weeks and days

The calendar is an **infinitely scrolling list of weeks**, not paged. Scrolling up loads previous weeks ("Loading previous weeks…"), scrolling down loads more, roughly two weeks at a time. You land on the current week.

Each week has a header reading **Week of Jul 7, 2026**, with badges for **This week**, and, when the workout pool is open, **Pool week** (an emerald ring on the week that accepts pool drops) or **Pool focus**.

The week header also carries:

- A **Shift** menu with **Shift week…** and **Shift discipline…**. This only appears for weeks *outside* an active season, because inside a season the week's targets come from the plan.
- An **×** that deletes all non-race planned sessions in the week, after a confirmation.

On wide screens, days are seven columns across with Mon–Sun headers. On narrower screens they stack vertically, each labelled like "Mon 7".

Within a day cell, top to bottom: planned session cards, the inline add form when open, then any completed activities that aren't linked to a session.

### A planned session card

| Element | Meaning |
| --- | --- |
| Drag handle (⠿) | Drag to reorder within the day or move to another day |
| Title | Click to open the session's detail page |
| Time pill | Shown when the session has a start time, e.g. "7:30 AM" |
| Sport pill | Bike / Run / Swim / Strength |
| Role badge | **Easy**, **Intensity**, or **Long** — click to cycle; **Set role** appears for Moderate |
| Pool size | SCY / SCM / LCM on swims |
| Metrics grid | **Planned** and **Completed** columns, with **Duration** and **Distance** rows |
| Mini chart | The workout's intensity profile when a structured workout is attached |
| **×** | Delete the session |

Race sessions are styled amber, cannot have structured workouts attached, and their role cannot be cycled.

Past sessions can be **shaded** by how closely you hit them — green within 10%, amber within 25%, red beyond that or not done at all. This is off by default; configure it per sport in **Settings → Units & display → Workout shading**.

### A completed activity card

Unlinked completed activities appear below the planned sessions for their day, with a drag handle, sport, duration and distance, and an **×** to delete. Drag one onto a planned session to link them. Multisport activities are grouped under a **Multisport** header with each leg draggable separately.

Activities already linked to a session are not shown separately — their numbers appear in that session's **Completed** column.

### Week metrics

Below each week is a collapsible **Metrics** panel. Collapsed, it shows pill summaries of scheduled and completed work. Expanded, it shows:

- **Season target** — the phase name and colour, a **Rest week** badge where applicable, total hours, and per sport: hours, **Target TiZ**, and **Zone budget left**.
- A **Scheduled / Completed** table — sport, session count, duration, distance, and stacked time-in-zone bars comparing the two.

Completed figures only appear for the current week and earlier.

## Adding sessions

### By hand

Press **+** on a day. That opens the inline quick-add form only — it does not open the workout pool. The form covers two cases:

- **Workout** — type, title, duration, distance or pace, and zone pills for a zone budget.
- **Race** — title, discipline toggles for swim/bike/run, a **Goal time** (accepting `mm:ss`, `hh:mm:ss`, or plain minutes), and distance.

Submit with **Save**. A second **+** on the form opens the full add-session page; after you create the session there, you land on its detail page to add a structured workout. Open the pool with **Workout pool** in the toolbar.

### From the workout pool

This is the intended path when you have a season. See [the workout pool](#the-workout-pool) below.

### From a weekly template

**Apply template** drops a whole week's layout at once. See [weekly templates](#weekly-templates).

### From a program

Apply a program from the library, or attach one to your season. See [chapter 7](./07-workout-library.md#programs).

The session page **Source** field shows whether a program copy is a library apply or attached through a season. **Clear future** in the library only removes unattached copies; season **Remove** only removes the season copy.

## The workout pool

The pool is your **remaining session budget for a week**: the sessions your season plan says you should do, minus everything already on the calendar. Open it with **Workout pool** in the toolbar.

It needs a week inside an active season. Otherwise: *"No season targets for this week. Pool appears for weeks inside your active plan."*

The panel contains:

- A week navigator (**◀** / **▶**) with the date range, and a phase dot and name.
- A discipline filter: **All**, **Swim**, **Bike**, **Run**, **Strength**.
- **Auto-fill easy TiZ** — spreads the week's remaining Z1 and Z2 minutes across easy and long sessions and saves them to the calendar. A quick way to finish a week once the hard sessions are placed.
- **Session cards**, one per unplaced slot: *"Select a card to build a workout, then drag it onto a pool-week day."*

Each card shows its sport, its **slot type**, a role badge, and either "Click to build" or a mini profile with duration and distance if you've drafted a workout for it.

Slot types map to session roles automatically when you drop a card:

| Slot type | Session role |
| --- | --- |
| Intense | Intensity |
| Long | Long |
| Endurance, Endurance (sub) | Moderate |

Above the calendar, a **Week TiZ** band shows scheduled versus season-target zone bars — overall or per sport, with a separate section for long sessions where relevant. It updates live as you draft, so you can watch the budget close.

Empty states tell you where you stand: *"All budgeted sessions are on the calendar."*, *"No typed pool slots for this week. Save the season with recalculate to populate slot budgets."*, or *"No cards match this discipline filter."*

### Building from the pool

On wide screens, selecting a card opens a workout builder beside the calendar with two tabs:

- **Steps** — the structured workout editor (the same one as the library; see [chapter 7](./07-workout-library.md#building-a-structured-workout)).
- **Components** — three columns of reusable pieces from your **Warm-up**, **Main set**, and **Cool-down** folders, which you drag in to assemble a workout quickly.

Buttons: **Save to session** / **Save changes**, **Edit workout**, **Clear**, **Done**, and a **Manage library →** link. Session cards themselves offer **Build**, **Edit**, **Duplicate**, and **Unassign** (which removes the structured workout but keeps the session).

Then drag the card onto a day in the pool week. The session is created with the right sport and role, inheriting a share of the week's remaining zone budget appropriate to its role — easy sessions draw from Z1–Z2, intensity sessions from Z3–Z5, long sessions from the long-session budget.

**Known limitations:** the pool is desktop-only and closes on screens narrower than 768px. Some things described in `docs/calendar-workout-pool-v2.md` and `docs/workout-pool-wizard-wireframe.md` — a suggested-intervals sidebar, dragging library folders inside the pool, and a role-picker dialog on drop — are not in the app; roles come from the slot type automatically.

## Drag and drop

Dragging starts after about 8 pixels of movement, so a click still registers as a click.

| Drag this | Onto this | Result |
| --- | --- | --- |
| Session card | Another day | Moves the session; any linked activity is unlinked |
| Session card | Another untimed session the same day | Reorders them |
| Activity card | An unlinked session card | Links the activity to that session |
| Pool session card | A day in the pool week | Creates the session, with any drafted workout attached |
| Assembled workout or component | An empty session card | Attaches the structured workout |

Sessions with a **start time** are ordered by that time, so same-day reordering is disabled for them — clear the start time if you want to hand-order a day.

There is no multi-select; sessions are handled one at a time.

## Shifting a week

Life interferes. **Shift week…** (dialog title **Shift calendar forward**) moves a week and everything after it to a new date. **Shift discipline…** does the same for one sport only, which is what you want when you are injured in one discipline but training the others.

You pick the **New date for week of …**, press **Review shift** to see a preview of how many sessions move and how many would be deleted, then **Confirm shift**. Sessions pushed past the end of a season may be dropped; races stay put.

The Shift menu is hidden for weeks inside an active season, where the plan defines the structure.

## Weekly templates

A weekly template is a reusable **Monday-to-Sunday layout** — which sports on which days, at what durations and roles. It is the skeleton of a typical week in a given phase.

Open the library with **Edit weekly template**, at `/calendar/template`:

> *"Build reusable weekday layouts once and assign them to phases, rest weeks, and test weeks across any season. Use Apply template on the calendar to drop a template onto a specific week."*

Press **+ New**, give it a name, and choose a category:

| Category | Use |
| --- | --- |
| **General** | Anything |
| **Phase** | Assigned to a phase in the season planner |
| **Rest week** | Used for weeks marked Rest |
| **Test week** | Used for weeks marked Test |

The editor is a seven-day grid. Press **+** on a day to add a session, then set **Type**, **Title**, **Role** (Easy / Moderate / Intensity / Long), **Min** (duration), **Dist** or swim distance, and **Pool** for swims. **Remove** deletes a session, **Save template** saves.

A template stores the weekday, discipline, title, duration, distance, pool size, role, and order for each session. It does **not** store structured workout steps, target zones, or times of day — those come later, from the pool or by hand.

### Applying one

**Apply template** on the calendar opens a dialog where you pick the template — shown as `name (category, count)` — and the **Week starting (Monday)**. If the week already has sessions, choose how to handle them:

| Option | Behavior |
| --- | --- |
| **Clear entire week** | Remove everything, then apply |
| **Clear template days only** | Remove previously templated sessions on the template's weekdays, then apply |
| **Add to existing** | Merge |

Press **Apply template**.

## Editing a planned session

Clicking a session title opens its page at `/workouts/{id}`, which combines planning fields with the analysis described in [chapter 4](./04-dashboard-and-analysis.md#workout-and-activity-detail).

| Field | Notes |
| --- | --- |
| **Date** | The scheduled day |
| **Start time (optional)** | Clearing it lets you hand-order the day on the calendar |
| **Sport** | Bike / Run / Swim / Strength |
| **Title** | Free text |
| **Source** | Where the session came from: calendar, weekly template, race, or a program. Program copies add **· season** when attached through a season. |
| **Session role** | Easy / Moderate / Intensity / Long |
| **TiZ metric** | Default, or override with power, pace, or heart rate for this session |
| Planned metrics | Duration, distance, pace or speed |
| **Zone budget** | Z1–Z5 minute pills. Hidden when a structured workout already defines the zones. |
| **Tags** | Free-form labels — see [tags and search](#tags-and-search) |
| **Notes** | Free text |
| Structured workout | The step editor, with a zone-budget preview |

Actions: **Save**, **Save & back to …**, **Cancel**, **Delete**, and, when a structured workout exists, **Export FIT** and **Export ZWO**.

**Session role** deserves a word, because it drives more than it appears to. It selects which signal scores your TiZ if you set role overrides, it determines how zone budget is inherited when placing sessions from the pool, and it changes how an unexpected RPE is interpreted for day quality. Marking a session **Easy** and then running it at RPE 8 is information the app uses.

### Planned versus completed

The stats panel shows **Planned** and **Completed** side by side — duration, distance, average speed or pace, and zone time. Completed values come from, in order of priority:

1. Manual completion overrides you typed in,
2. the linked activity's metrics and zone breakdown,
3. the planned values, if nothing is completed.

You can override completed values by hand — useful for strength work or a pool swim you didn't record — and **Reset to activity** puts them back.

**Unlink activity** breaks the link if it was wrong. Linking is covered in [chapter 3](./03-importing-and-syncing.md#linking-activities-to-planned-sessions).

## Attaching a structured workout

A planned session starts as a skeleton: sport, duration, role. Attaching a **structured workout** gives it steps with targets — the thing your watch can follow.

Ways to do it:

| Method | How |
| --- | --- |
| Pool builder | Build in the pool's editor, then **Save to session**, or drag the assembled workout onto the session card |
| Workout builder pane | Open it from the toolbar, pick a folder and template, drag onto a session |
| Components | Drag warm-up, main-set, and cool-down pieces into the builder, then apply |
| Session page | Edit the structured workout directly on the session |

Attaching is blocked on race sessions and when the workout's discipline doesn't match the session's. To replace an existing workout, use **Edit** or **Unassign** first.

## Exporting to your device

From a session with a structured workout:

- **Export FIT** — a Garmin workout file. Copy it to your watch or head unit.
- **Export ZWO** — a Zwift workout file.

FIT export resolves every relative target into absolute numbers using your current thresholds and race paces. If something it needs is missing, the export is blocked with a message naming what to set, for example "Set missing intensity anchors before FIT export: …". Fill in the missing threshold and try again.

Step notes travel with the workout, and swim equipment is appended to them, so a step note reads like `Build to threshold · Equipment: Fins, Paddles` on the device.

More on building workouts, targets, and export in [chapter 7](./07-workout-library.md).

## Tags and search

### Tags

Sessions can carry free-form tags, edited in the session's **Tags** field. Type and press **Enter** or a comma to add one; suggestions come from tags you have used before. Up to 20 tags of 40 characters each; matching is case-insensitive.

Tags are good for the things TiZ doesn't model: `hill-reps`, `heat`, `treadmill`, `with-group`, `new-shoes`.

### Search

**Search** in the toolbar opens **Search training history**:

| Filter | Notes |
| --- | --- |
| **Title** | Text search; Enter runs it |
| **Discipline** | Any, or one sport |
| **From** / **To** | Date range |
| Min and max **duration** | In minutes |
| Min and max **distance** | In your display units |
| **Tags (all must match)** | Comma-separated; every tag must be present |

Results cover planned sessions and completed activities together, 40 at a time with a **Load more**, each with **Open week** and **Details** links. This is the closest thing to a browsable activity list.

## Subscribing to your calendar

**Settings → Integrations → Calendar subscription** produces a private URL you can subscribe to in Apple Calendar, Google Calendar, or Outlook.

Press **Generate subscription URL**, then **Copy URL**. **Regenerate** issues a new URL and invalidates the old one; **Disable** turns the feed off.

The feed carries the next **90 days** of planned workouts. Sessions with a start time appear at that time for their planned duration; sessions without one appear as all-day events. Each event links back to its session page.

## Importing a week from CSV

CSV import lives with programs, at **Workouts → Programs → Import CSV**, and can either **Upload to calendar** or **Save as program**. **Download template** gives you the expected columns, and `docs/samples/week-2027-07-05.csv` is a worked example. It handles dated sessions, nested step rows, roles, pool sizes, and relative pace tokens — see [chapter 7](./07-workout-library.md#csv-import).

---

Next: [7. Workout library and programs →](./07-workout-library.md)
