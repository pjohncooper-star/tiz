[← Guide index](./README.md)

# 4. Dashboard and workout analysis

## The Dashboard

The Dashboard is your home screen. The header shows your total activity count, and below it are three cards.

### Yesterday · Today · Tomorrow

Three columns of session cards covering the day before, today, and the day after. Each card shows a discipline badge, a status badge, the title, and duration — planned versus completed when the two differ.

| Status | Meaning |
| --- | --- |
| **Planned** | Today or in the future, not yet done |
| **Done** | A completed activity is linked, or you marked it complete manually |
| **Missed** | In the past, still not done |
| **Extra** | A completed activity with no planned session on that day |

Clicking a planned session opens its detail page. Clicking an "Extra" activity opens the same analysis view for that activity.

This card is deliberately narrow — it answers "what am I doing today and did I do yesterday's session," not "show me my week." For the week view, use the [planning calendar](./06-planning-calendar.md).

### The PMC chart

The second card is titled **PMC (ECO)** or **PMC (TiZ / hours)** depending on whether you have ECO training load enabled. PMC stands for performance management chart, and it plots the classic three curves:

| Curve | What it is | Time constant |
| --- | --- | --- |
| **Fitness** | Your accumulated long-term training load | About 42 days |
| **Fatigue** | Your accumulated short-term training load | About 7 days |
| **Form** | Fitness minus fatigue | — |

The interpretation is the standard one: fitness rises slowly and decays slowly; fatigue rises and falls fast; form is positive when you are relatively fresh for your fitness level and negative when you are digging a hole. Whether a given form number is "good" depends entirely on your own history, so read the shape of the curve rather than the absolute value.

Two things make this chart more useful than most:

- **It is computed per sport as well as combined.** Swim, bike, and run each get their own fitness and fatigue track, and the combined view is the sum. This matters for triathletes, where run fatigue and swim fatigue are not interchangeable.
- **It projects forward.** Solid lines are scored history; **dashed lines** are the projection from your planned calendar sessions, or from your season planner's draft weeks. You can therefore see the taper you have planned before you ride it.

A toggle switches between showing **Form** and showing **Fitness / fatigue**. A footnote states the time constants and the load unit in use.

The load unit is either **ECOs** or **hours** — see [training load](#training-load-eco) below.

### At a glance

The third card holds the analytics, with a date range picker at the top.

| Preset | Span |
| --- | --- |
| Last week | 7 days |
| Last two weeks | 14 days |
| Last month | 30 days |
| **Last 6 weeks** (default) | 42 days |
| Last 3 months | 90 days |
| Last 6 months | 182 days |
| Last year | 365 days |
| This season | Your active season's start to today |
| This cycle | The current mesocycle's start to today |
| Custom | Pick your own **From** and **To** |

"This season" and "This cycle" need an active season plan; "This cycle" also needs mesocycles, which the planner creates for you. When you pick "This cycle", the name of the mesocycle is displayed alongside the range.

Only swim, bike, and run activities are included in these panels.

#### Longest run and Longest ride

Two cards showing the longest single run and ride by distance in the range, with duration, date, and a link to the activity. Ties break toward the longer duration, then the later start.

#### Duration curves

A toggle between **Power** and **Run pace**.

**Power** draws a **mean-maximal power curve**: for each of a fixed set of durations — 5s, 10s, 20s, 30s, 1m, 2m, 5m, 10m, 20m, 30m, 45m, 1h, 90m, 2h, 3h — it finds the best average power you sustained for that long in any single ride in the range, then plots the best across all of them. It is your power profile for the period: the left end describes your sprint, the right end your endurance.

**Run pace** does the same with running pace, plotting the best average pace over each duration. The axis is reversed so faster is higher, which makes it read like the power curve.

#### Weekly volume and zone mix

**Weekly volume** is a stacked bar chart, one bar per Monday-start week, in hours, stacked by sport — swim, bike, run. Volume per activity prefers your **TiZ minutes** (the sum of Z1–Z5) and falls back to the activity's recorded duration where zone data is missing. That distinction matters: a ride whose power meter died contributes its raw duration, not zone minutes.

**Zone mix** is a bar chart below it: total hours in each of **Z1** through **Z5** across all three sports in the range. This is the quickest way to check whether your "easy" base block was actually easy.

## Workout and activity detail

Every completed activity and every planned session opens the same page, at `/workouts/{id}`. Opening an activity URL redirects here — if the activity has no planned session, one is created for it on the fly so there is always something to hold your notes, tags, and role.

**Known naming quirk:** "activity" means a recorded file and "workout" means the session page that displays it. There is no separate activities list page; to browse history, use the calendar's search pane or scroll the calendar itself.

The page combines planning controls at the top (see [chapter 6](./06-planning-calendar.md#editing-a-planned-session)) with analysis below. Which analysis cards appear depends on what data exists.

### Summary

For non-endurance sessions — strength, mainly — a summary card lists what was recorded: duration (moving and elapsed when they differ by more than a few seconds), distance, average speed or pace, average power, average cadence, average heart rate, and swim rest time.

Units follow your per-sport settings: km/h or mph, min/km or min/mi, min/100m or min/100yd, rpm for bike cadence and spm for run cadence.

For swim, bike, and run this card is skipped, because the same numbers appear in the charts and zone table.

### Time in zone

A table with one row per zone:

| Column | Meaning |
| --- | --- |
| **Zone** | Z1 to Z5 |
| **Time** | Minutes in that zone |
| **%** | Share of total zone time |
| **Range** | The actual intensity range that zone spans for you — watts, pace, or bpm |

The header states which signal was used — **Power**, **Pace**, or **Heart rate** — and appends **(fallback)** if your primary signal was unusable and TiZ used the other one. It also shows the threshold value it scored against, which is the threshold that was in effect on that activity's date, not today's.

### Execution chart

For bike and run activities with data streams, a chart of the session over time.

- **Bike metrics:** power, heart rate, cadence, speed
- **Run metrics:** pace (axis reversed so faster is up), cadence, heart rate
- **X axis:** toggle between **Time** and **Distance**

Each metric can be toggled on and off.

When the session had a **structured workout** attached *and* your device recorded workout steps, the card is titled **Workout analysis** and three overlays become available:

| Overlay | What it draws |
| --- | --- |
| **Laps** | Shaded vertical bands, one per device lap |
| **Targets** | Horizontal bands showing the planned intensity range for the step you were in |
| **Planned** | A dashed "ghost" line of the planned intensity profile |

Together these answer "did I actually hit the intervals" visually. The tooltip adds the current step's name, its target range, your live values, and lap averages.

Without a structured workout and matching lap data, the card is simply titled **Activity** and shows your streams alone.

**Swim** does not get this chart. Instead swims get a **Lap pace** bar chart — one bar per lap, with rest laps drawn slower than your slowest swim and labelled **Rest**.

### Step execution

When a structured workout can be matched against your device's laps, a table compares them step by step:

| Column | Meaning |
| --- | --- |
| **Step** | The planned step's label; "(open)" for open-ended steps |
| **Planned** | Planned duration |
| **Actual** | Duration of the matched lap |
| **Δ** | The difference — green within 5 seconds, amber within 30, red beyond |

Repeats are grouped under their set label, for example "Interval 1".

### Training load (ECO)

**ECO** stands for *objective load equivalents*: a single number per session that lets you compare a hard swim to an easy long ride. It is based on published research on weighting training time by intensity zone (Cejuela-Anta & Esteve-Lanao, 2011).

The idea is that time is not linear in cost. ECO divides intensity into eight zones and gives each a weight:

| ECO zone | Label | Weight |
| --- | --- | --- |
| 1 | below AeT | 1 |
| 2 | AeT | 2 |
| 3 | AeT–AnT | 3 |
| 4 | AnT | 4 |
| 5 | above AnT | 6 |
| 6 | MAP | 9 |
| 7 | LAC Cap | 15 |
| 8 | LAC Pow | 50 |

AeT is the aerobic threshold region, AnT the anaerobic (lactate) threshold region, MAP maximal aerobic power, and the two LAC zones lactate capacity and lactate power. A minute of all-out sprinting therefore carries fifty times the load of a minute of easy spinning.

The session score is the sum of (minutes in zone × zone weight), multiplied by a **discipline factor** reflecting mechanical load: run 1.0, swim 0.75, bike 0.5. Multisport races get a small bump on later legs — running off the bike costs more than running fresh.

Your session's ECO score appears on the workout page as the **ECO load** card, and ECO is the unit behind the PMC chart, weekly totals, and some Workout Signaling patterns.

**Turning it off.** ECO is optional. **Settings → Training & planning → Training load (ECO)** has a **Show ECO training load** checkbox, off by default on a new account. With it off, every ECO reference disappears and the PMC chart switches to **hours** — TiZ hours where zone data exists, activity duration where it doesn't. Turning it off also deletes ECO-based Workout Signaling insights.

### Self evaluation

Below the analysis, a **Self evaluation** card asks how the session went. Two fields are always present:

| Field | Scale |
| --- | --- |
| **How it felt** | Five options: Very weak, Weak, Normal, Strong, Very strong |
| **Perceived effort** | RPE 1–10 |

You can add up to four more from **Settings → Workouts → Self evaluation**: **Sleep quality**, **Motivation**, and **Soreness** (1–5 scales), **Notes** (free text), or your own custom 1–10 scale. Six fields is the maximum.

Press **Save self evaluation** when done.

**Imported from your device.** If you answered Garmin's post-workout "how did you feel" and effort prompts, those come across in the FIT file and pre-fill these two fields. The card notes when values came from your device rather than from you typing them here.

**Day quality.** From your feel rating and your RPE, TiZ derives a **day quality** — great, good, rough, or bad — which is what Workout Signaling analyses. Feel drives it primarily:

| Feel | Day quality |
| --- | --- |
| Very weak | Bad |
| Weak | Rough |
| Normal | Good |
| Strong or Very strong | Great |

An RPE that doesn't match the session's role can pull it down: RPE 7 or higher on an **Easy** day marks the day bad, RPE 6 marks it rough, and RPE 9 or higher on a **Long** day marks it rough. The reasoning is that a recovery run that felt like an 8 is a signal regardless of how you rated the vibe. On intensity and moderate days, high RPE is expected and doesn't change day quality.

This feeds directly into [chapter 8](./08-workout-signaling.md).

---

Next: [5. The season planner →](./05-season-planner.md)
