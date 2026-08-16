[← Guide index](./README.md)

# 7. Workout library and programs

**Workouts** in the sidebar holds two related but distinct things, on two tabs:

- **Workouts** — a folder library of reusable **structured workouts**: step-by-step sessions with targets, which you attach to calendar days and export to your device.
- **Programs** — reusable **multi-week programs**: a whole block of sessions positioned by day offset, which you apply to a date range or attach to a season.

The rule of thumb: a workout is one session you might repeat; a program is a multi-week block.

Neither is your history. Completed activities live on the calendar and the dashboard.

## The workout library

> *"Organize workouts in folders. Progression folders keep an ordered sequence."*

Two panels: folders on the left, the selected folder's contents on the right.

### Folders

Create one with **Folder name**, a kind, and **Add folder**. Folder kinds carry badges in the tree (`lib`, `prog`, `wu`, `main`, `cd`):

| Kind | Purpose |
| --- | --- |
| **Library** | General organization. Can contain subfolders. |
| **Progression** | An ordered sequence of workouts, and it remembers which one you last completed |
| **Warm-up** | Warm-up pieces |
| **Main set** | Main-set pieces |
| **Cool-down** | Cool-down pieces |

The last three matter beyond labelling: the calendar's builder shows **Warm-up**, **Main set**, and **Cool-down** as three columns of components you drag together into a workout. Putting your standard 15-minute run warm-up in a Warm-up folder means you assemble it into any session in one drag.

**Progression folders** are for sequences you work through in order — a six-week set of increasingly hard threshold sessions, for example. Workouts are numbered `1.`, `2.`, `3.` and reordered with **↑** and **↓**. When you complete a calendar session that came from a progression folder, the folder records it and shows **Last done: {workout name}**, so you know where you are in the sequence.

Subfolders can only go under a Library folder — a Progression folder holds workouts only. **Delete folder** requires the folder to be empty.

**Known limitations:** there is no way to rename a folder, move a folder, or move a workout between folders in the UI.

### The selected folder

The right panel shows the folder's name, its kind, optionally a discipline, and for progression folders the **Last done** line. **Add workout** creates a new one; each row has **Edit** and **Delete**. Library folders with children list their **Subfolders**.

## Building a structured workout

Press **Add workout** in a folder, or **Edit** an existing one.

### Workout details

**Name** and **Discipline** (**Run**, **Bike**, or **Swim**). Then **Save** or **Cancel**.

### The steps panel

Two global controls set the vocabulary for the whole workout:

| Control | Options |
| --- | --- |
| **Target** | **Zone**, **Pace** (run and swim) or **Power** (bike), **Heart rate** |
| **Step length** | **Duration** or **Distance** |

Below them, **Total estimated duration** updates as you edit, and a **profile chart** draws the workout as coloured blocks so you can see its shape.

Four ways to add:

| Button | Adds |
| --- | --- |
| **Add step** | A single step |
| **Add repeat** | A repeat block containing steps |
| **Add ramp** | A step that ramps from one intensity to another |
| **Add interval set** | A compact swim set (swim only) |

Every node has a drag handle for reordering, and repeats accept steps, ramps, swim sets, and even other repeats dragged inside them.

### Steps

| Control | Notes |
| --- | --- |
| **Step type** | **Warm up**, **Steady**, **Interval**, **Recovery**, **Rest**, **Cool down** |
| Target | Depends on the target mode — see below |
| **Range** | Turns a single target into a low–high range |
| Duration or distance | Duration as `H:MM:SS`; distance in metres, miles, or pool units |
| **Lap end** | Run and bike, duration mode: the step ends when you press the lap button rather than at a fixed time. An optional **Est. duration** keeps planning totals sensible. |
| **Notes** | Free text, carried through to the device |
| **Equipment** | Swim only: toggle chips from your equipment list |
| **Remove** | Deletes the step |

Step type is not cosmetic: it colours the profile chart and tells the device what kind of step it is.

### Repeats

A repeat block is headed **Repeat × 4** and has a **Repeat count** from 1 to 99, optional notes, and **Add child step**. Its children are indented.

A new repeat starts as 4 × (4 minutes at zone 4, 4 minutes at zone 2) — a plausible interval set you then adjust.

To build `5 × 3 min hard / 2 min easy`: **Add repeat**, set the count to 5, set the first child to **Interval** for 3 minutes at your hard target, and the second to **Recovery** for 2 minutes easy. Nest another repeat inside for sets-of-sets.

### Ramps

A ramp linearly changes intensity over its duration. Fields depend on the target mode: **Start zone** / **End zone**, **Start HR zone** / **End HR zone**, **Start power (W)** / **End power (W)**, or **Start pace** / **End pace**, plus a duration and notes.

Useful for progressive long runs, warm-ups that build, and ramp tests.

### Swim interval sets

Swim gets a compact node instead of hand-built repeats, headed with a label like `10×100m on 1:30`:

| Control | Notes |
| --- | --- |
| **Repeats** | Number of reps |
| **Distance (m)** or **(yd)** | Per rep, in 25 or 50 increments |
| **Between reps** | **Leave on** or **Rest** |
| Time field | The send-off time, or the rest duration |
| Pace target | A pace zone, or an absolute per-100 pace |
| **Notes**, **Equipment** | As on any step |

**Leave on** is the send-off convention — `10×100 on 1:30` means a new 100 every 90 seconds, so faster swimming buys more rest. **Rest** is a fixed rest after each rep regardless of swim speed. Defaults are 10 × 100 m on 1:30 at zone 4.

### Targets

What you can prescribe depends on the target mode:

**Zone mode** — a dropdown from **Zone 1** to **Zone 7**, or a **Zone range** with two dropdowns. (Zones 6 and 7 exist for workout prescriptions above the five TiZ zones.)

**Heart rate mode** — **HR zone 1** to **HR zone 5**, or a range. There is also a **Use relative HR…** link for a percent of LTHR or max HR.

**Power mode (bike)** — absolute **Power (W)**, or a low/high watt range.

**Pace mode (run and swim)** — an absolute pace in your display unit (**Pace (min/km)**, **(min/mi)**, **(min/100m)**, **(min/100yd)**), or a range with **Fast** and **Slow** fields. There is also a **Use relative pace…** link, which is the more interesting option.

**Not available in the visual editor:** RPE as a step target (RPE exists only in post-workout self-evaluation), and percent-of-FTP typed targets (those work through CSV import — see [below](#csv-import)).

### Relative pace targets

Instead of `4:15/km`, a step can target **10k pace**, or **95% of 5k pace**. Press **Use relative pace…** and set:

| Control | Options |
| --- | --- |
| Anchor | **threshold**, **5k**, **10k**, **HM**, **marathon** |
| Percent | Percent of the anchor's *speed*; 100 means exactly that pace |
| Fitness or goal | **Fitness pace** or **Goal pace**, for non-threshold anchors |

A preview line shows what it resolves to right now, for example `95% 10k pace → 4:45`. **Absolute** switches back to a typed pace.

Percentages are of **speed**, so 95% is slightly *slower* than the anchor and 105% is faster. The formula is `resolved pace = anchor pace × 100 ÷ percent`.

Why bother: relative targets track your fitness. Run a faster 10k, update **Settings → Thresholds & paces → 10k pace**, and every upcoming workout that referenced 10k pace retargets itself — no re-applying plans, no editing sessions. And once a session is linked to a completed activity, its relative targets are **frozen** to the absolute values that were in effect, so your history doesn't get rewritten every time you get fitter.

Set the anchors in **Settings → Thresholds & paces**. If a goal pace is empty, the fitness pace is used instead.

### Relative heart-rate targets

Instead of an HR zone, a step can target a percent of **LTHR** or **max HR**. Press **Use relative HR…** and set:

| Control | Options |
| --- | --- |
| Anchor | **LTHR** (the sport's heart-rate threshold) or **Max HR** (the athlete-level setting) |
| Percent | Percent of that anchor |

A preview line shows what it resolves to right now, for example `80% LTHR → 132` or `80% max HR → 152`. **Absolute** switches back to HR zones.

Bare `80%` in CSV is the same as LTHR, so existing imported plans do not jump ~20 bpm when you fill in max HR. Use `80%|max` or pick **Max HR** in the editor for coaching-style percent-of-max prescriptions.

Set **Max heart rate** and each sport's **LTHR** in **Settings → Thresholds & paces**. TiZ zones still use LTHR only.

### How targets become real numbers

A few conversions happen quietly and are worth knowing about:

- **Zone targets on run and swim** map to a percentage of threshold speed, and from there to an actual pace — used for the profile chart, duration estimates, and device export.
- **Distance-based steps** get their duration estimated from the target pace, so a 5 km step at 10k pace contributes a sensible number to your weekly hours.
- **Swim interval sets** expand internally into repeats of work and rest steps for export and charting.

### Editing feel

Numeric fields in this app **commit when you leave the field or press Enter**, not on every keystroke. This is deliberate: it means you can clear a field completely and type a new value without the app reacting to the half-finished number in between. If a change doesn't seem to take, click elsewhere or press Enter.

## Exporting to a device

Export happens from a **planned session**, not from the library — a library workout is a template, and the export needs a date and your current thresholds.

So: attach the workout to a calendar session ([chapter 6](./06-planning-calendar.md#attaching-a-structured-workout)), open the session, and press **Export FIT** or **Export ZWO**.

| Format | Notes |
| --- | --- |
| **FIT** | A Garmin workout. Supports zones, absolute and range paces, power, heart rate, ramps, repeats, and swim sets. Relative targets are resolved to absolute values at export time. |
| **ZWO** | A Zwift workout. Time-based steps mapped to power fractions; simpler than FIT, and swim-specific features don't translate. |

If FIT export needs a threshold you haven't set, it refuses and names what's missing: "Set missing intensity anchors before FIT export: …". Fill in the named FTP, threshold pace, race pace, LTHR, or max heart rate.

**Step notes on the device** are your note text plus any swim equipment, joined as `{notes} · Equipment: Fins, Paddles`. Useful for the things a target can't express: "relaxed hands", "aim for even splits", "stop if the hamstring talks".

## Programs

> *"Reusable programs for the calendar. Distinct from the workout folder library."*

A program is a multi-week block of sessions stored by **day offset** — day 0 is the first session day, and gaps are rest days. Because it is relative, the same program can be applied to any start date, or anchored to end on a race.

This is how you get a published block, a coach's block, or your own successful build into TiZ once and reuse it.

Limits: 500 sessions, 182 days (26 weeks). Gaps longer than 21 days warn you; longer than 90 days require confirmation.

### Creating one

There is no blank-program button; a program starts from content:

| Method | How |
| --- | --- |
| **Import CSV** | Choose **Save as program**, name it, upload the file |
| **Create from calendar…** | Pick a date range on your calendar to capture as a program |

Either way you land in the editor, where **Add** creates further sessions.

"Create from calendar" is the one to remember: after a block that worked, capture those weeks as a program and you can run it again next year.

### The program list

Each saved program shows `{n} sessions · {n} days ({n} weeks) · starts {weekday}` and four actions:

| Action | Effect |
| --- | --- |
| **Edit** | Open the editor |
| **Apply** | Copy the program's sessions onto your calendar |
| **Clear future** | Remove this program's calendar sessions from today onward; the past is left alone |
| **Delete** | Remove the library program. Sessions already applied to the calendar stay. |

### The program editor

> *"Changes here update the library only. Applied calendar sessions are separate copies."*

That note matters: editing a program does not retroactively change weeks you already applied, and editing a calendar session does not change the library program.

At the top, **Program name** and **Description**, with **Save program details**, **Apply…**, and **Clear future**. A stats line shows sessions, days, the anchor weekday, and how many future sessions are currently on your calendar, plus any race-pace anchors the program requires.

Three areas:

- **Sessions** — a list of `Day {n} · {discipline}` entries, each marked *structured* or *skeleton*, with **Add**.
- **Week grid** — Monday-to-Sunday columns with a coloured dot per day: blue for bike, amber for run, green for swim, grey for strength, sized by that day's volume. Click a dot to select the day's session; press **+** to add one. This is the quickest way to see whether a program's weeks are balanced and where its hard days sit.
- **Session editor** — for the selected session:

| Field | Notes |
| --- | --- |
| **Title** | Required |
| **Discipline** | Run, Bike, Swim, Strength |
| **Day offset (0 = first day)** | Where it sits in the program |
| **Role** | Easy, Moderate, Intensity, Long |
| **Duration (minutes)** | May be left empty for a skeleton session |
| **Notes** | Free text |
| **Structured workout** | A checkbox that reveals the full step editor |

Skeleton sessions carry no targets: *"Skeleton session — no step targets. Enable structured workout to edit the tree."* That's fine for programs where you decide the detail week by week.

**Known limitation:** sessions are repositioned by editing the **Day offset** field; there is no drag-reordering in the program editor.

### Applying a program

**Apply…** opens a dialog:

| Control | Options |
| --- | --- |
| Anchor | **Start date** or **End date** |
| Date | The chosen anchor date |
| Overlap handling | **Merge**, or **Replace this program's sessions in range** |

A preview shows the window, the sessions, any truncation, and any missing pace anchors before you commit.

**End date** anchoring is what you use for a race: pick the race date as the end and the program counts backwards. If the resulting start would be in the past, the program is truncated from the front, keeping the portion that ends on your date — which is exactly what you want when you find a 16-week program 10 weeks out.

Workout trees are copied **as stored**: relative targets stay relative and follow your fitness; frozen or absolute steps stay put.

### Attaching a program to a season

Instead of applying a program directly, you can attach it to a season in the season planner, which additionally makes the program's sessions count toward the season's weekly hours, TiZ, and session budget, and lets you **pause** individual weeks. See [chapter 5](./05-season-planner.md#attaching-a-program).

Use **Apply** when the program *is* your training. Use **Attach to season** when the program is part of a season you are also managing in TiZ.

## CSV import

**Import CSV** on the Programs tab reads a spreadsheet of sessions and either uploads them straight to the calendar or saves them as a program. **Download template** gives you the columns; `docs/samples/week-2027-07-05.csv` is a working example.

CSV is the most direct route for transcribing a program from a spreadsheet, and it accepts some targets the visual editor does not:

```csv
signal,target_mode,target
pace,relative,threshold
pace,relative,10k
pace,relative,95%|5k
power,value,130%
heart_rate,value,80%
heart_rate,value,80%|max
```

| Token | Meaning |
| --- | --- |
| `threshold` | Your current run or swim threshold pace |
| `5k`, `10k`, `half`, `marathon` | Race-pace anchors |
| `95%\|10k`, or `95% of 10k` | 95% of that anchor's speed |
| `130%` with `signal=power` | 130% of FTP, stored relative and resolved live |
| `80%` or `80%\|lthr` with `signal=heart_rate` | 80% of that sport's **LTHR** |
| `80%\|max` or `80% of max` with `signal=heart_rate` | 80% of athlete **max heart rate** |
| `4:30` with `target_mode=value` | An absolute pace |

Do not combine a `relative` pace with `zone`, `target_low`, or `target_high` columns.

CSV import also handles roles, pool sizes, and nested step rows for structured workouts.

## Finding things

**Tags** are applied to *planned sessions* (on the session page), not to library workouts, and **Search training history** on the calendar searches sessions and activities. Both are covered in [chapter 6](./06-planning-calendar.md#tags-and-search).

Within the library itself, organization is by folder — which is why it is worth putting some thought into your folder structure early, given that folders cannot currently be renamed or reorganized.

---

Next: [8. Workout Signaling →](./08-workout-signaling.md)
