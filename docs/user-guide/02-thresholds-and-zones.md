[← Guide index](./README.md)

# 2. Thresholds and zones

Everything TiZ tells you about intensity flows from a small number of threshold values. Get these roughly right and the rest of the app is meaningful; leave them at the defaults and your zone times will be fiction.

You edit them in two places, and both use the same editor:

- During onboarding, **Step 2 — Current thresholds**
- Afterwards, **Settings → Thresholds & paces**

## What TiZ measures

**TiZ** is *time in zone*: minutes spent in each of five intensity zones, **Z1** through **Z5**, tracked separately per sport. A planned session carries a zone budget ("40 minutes of Z2, 20 of Z4"); a completed activity carries the zone minutes you actually accumulated. Comparing the two is the core loop of the app.

Zones are always defined **relative to a threshold**, as a percentage. That is what makes them comparable across a season: when your FTP goes up, the same Z3 means a higher wattage.

## Your threshold values

| Sport | Signals | Field label | Default estimate on a new account |
| --- | --- | --- | --- |
| Bike | Power | **BIKE FTP (watts)** | 200 W |
| Bike | Heart rate | **BIKE LTHR (bpm)** | 165 bpm |
| Run | Pace | **RUN (min/km)** or **RUN (min/mi)** | 5:00 /km |
| Run | Heart rate | **RUN LTHR (bpm)** | 170 bpm |
| Swim | Pace | **SWIM (min/100m)** or **SWIM (min/100yd)** | 2:00 /100 m |

Above the per-sport rows there is a single athlete-level **Max heart rate (bpm)** field. It is optional and is used only when a workout step targets a percent of max HR (`80%|max`). Leave it empty if you do not use those prescriptions. It does **not** change TiZ zone boundaries.

- **FTP** — functional threshold power, the power you could hold for roughly an hour.
- **LTHR** — lactate threshold heart rate, not max heart rate. Workout steps written as a bare `80%` heart-rate target resolve against this value.
- **Max heart rate** — one number for the athlete, not per sport. Used only for `% of max` workout targets.
- **Run threshold pace** — roughly your one-hour race pace; close to a 15K–half marathon pace for most runners.
- **Swim threshold pace** — your critical swim speed (CSS), the per-100 pace you could hold for a long continuous swim.

Swim has no power or heart-rate option in the editor: swim TiZ is always scored from pace.

Pace fields take `mm:ss` and are shown in whatever unit you picked. Each pace row has a unit toggle — **min/km** / **min/mi** for the run, **min/100m** / **min/100yd** for the swim — so you can enter values in the units you think in.

The values a new account starts with are estimates, and history views mark them **(est.)** so you can tell which entries you set yourself.

## Primary metric

For bike and run you can be scored by two different signals, so you choose which one counts. The radio button labeled **Primary** next to a signal makes it your primary metric.

Defaults:

| Sport | Primary | Fallback |
| --- | --- | --- |
| Bike | Power | Heart rate |
| Run | Pace | Heart rate |
| Swim | Pace | — |

When TiZ scores an activity, it decides which signal to use in this order:

1. A **per-session override** on that specific planned session, if you set one.
2. The **structured workout's own prescription** — if the workout was built in watts, it is scored in watts; if it was built in pace, it is scored in pace.
3. A **session-role override** (see below).
4. Your **discipline primary metric**.

If the chosen signal's data is unusable — fewer than 80% valid samples, for example a dropped power meter — TiZ falls back to the other signal for that sport and marks the zone table as **(fallback)**.

### Role overrides

Under **TiZ metric by session role** (bike and run only) you can score different kinds of sessions with different signals. The four roles are **Easy**, **Moderate**, **Long**, and **Intensity**, and each gets a dropdown: **Default** or the alternate signal. There is an **Effective from** date and a **Save role metrics** button.

This exists because many athletes want intervals scored by power but easy and long days scored by heart rate — power on a recovery ride tells you very little, whereas drift in heart rate tells you a lot.

## How zones are computed

Each threshold profile stores the threshold value plus a set of **zone cutoffs** expressed as a percentage of threshold. TiZ walks your activity's data stream sample by sample, works out what percentage of threshold each sample is, assigns it a zone, and accumulates the time.

For power and heart rate, a higher percentage is harder. For pace, cutoffs are percentages of threshold **speed**, so again higher is harder (faster).

Default cutoffs, as percentages of threshold:

| Signal | Z1/Z2 | Z2/Z3 | Z3/Z4 | Z4/Z5 |
| --- | --- | --- | --- | --- |
| Bike power | 55 | 75 | 90 | 105 |
| Run pace (speed) | 78 | 89 | 95 | 102 |
| Swim pace (speed) | 75 | 90 | 99 | 105 |
| Heart rate (any sport) | 68 | 83 | 94 | 100 (with a soft cap at 106) |

Read the run pace row as the conventional five-zone running model: Z1 below 78% of threshold speed, Z2 from 78 to 88%, Z3 from 89 to 94%, Z4 from 95 to 102% (straddling threshold), Z5 at 102% and above.

### Customizing cutoffs

Expand **Edit zone boundaries** under any sport to change them. The editor shows each cutoff both as a percentage and as the absolute value it works out to at your current threshold — watts, bpm, or a pace — so you can sanity-check it against how the numbers feel.

Cutoffs must be positive and strictly increasing. If you break that, the editor tells you: "Zone cutoffs must be strictly increasing."

Cutoffs are stored per sport *and* per signal, so your bike power zones and bike heart-rate zones are independent.

## Threshold history

Fitness moves, and TiZ scores every activity against the thresholds that were in effect **on the date of that activity**. That's what the **Threshold & primary metric history** section is for. Under Settings it is collapsed behind **Show history**; during onboarding it is Step 3.

There are two kinds of entry:

- **Threshold entries** — discipline, signal, **Effective from** date, and value. Each applies from its date until the next entry for the same discipline and signal.
- **Primary metric changes** (bike and run) — the date you switched between power and heart rate, or pace and heart rate, with optional role overrides.

You do not need this to use the app. It matters most if you are importing several years of history: without it, a 2023 base ride is scored against your 2026 FTP, and its zone distribution will look far easier than it was.

**When you change a threshold**, TiZ recomputes zones for the affected date range in the background. Charts and zone tables for older activities will shift as that runs. See [chapter 3](./03-importing-and-syncing.md#background-jobs).

## Race paces

**Settings → Thresholds & paces → Race paces** is a separate set of anchors, all optional, all `mm:ss` per kilometre:

| Group | Fields |
| --- | --- |
| Current fitness paces | **5k pace**, **10k pace**, **Half marathon pace**, **Marathon pace** |
| Goal paces | **Goal 5k**, **Goal 10k**, **Goal half**, **Goal marathon** |

These let a workout prescribe an intensity *by name* rather than by number: a step can target "10k pace" or "95% of 5k pace", and TiZ resolves it against these anchors when it draws the workout, estimates its duration, and exports it to your watch. Update your 10k pace after a race and every upcoming workout that referenced it retargets automatically.

Goal paces exist for the case where you want to rehearse a race you haven't run yet — marathon-pace work aimed at a target time rather than your current fitness. If a goal pace is empty, the corresponding fitness pace is used instead.

Full syntax and behavior is in [chapter 7](./07-workout-library.md#relative-pace-targets).

## Swim specifics

**Pool size** is set per athlete in **Settings → Units & display** — **SCY (25y)**, **SCM (25m)**, or **LCM (50m)**, defaulting to SCM. It drives the distance and pace units on swim workout step cards.

**Rest in the pool** is handled in two places, neither of which you configure:

- **In zone scoring**, swim rest laps (zero speed) are credited to **Z1**. Standing on the wall counts as easy time, not as no time.
- **On the lap pace chart**, rest intervals are drawn at a synthetic slow pace — 60 seconds slower per 100 than your slowest swimming interval — and labelled **Rest**, so they are visible without compressing the scale of the real swims.

## Two zone models, and why

You will see two different zone systems in the app, and they are not the same thing:

- **TiZ zones, Z1–Z5.** Used for planning, for the calendar, for zone budgets, and for the zone table on every activity. This is the model described above.
- **ECO zones, 1–8.** Used only for computing training load. They are a finer-grained set — sub-aerobic-threshold, AeT, AeT–AnT, AnT, above AnT, MAP, and two lactate zones — each with a weight, so that a minute of very hard work counts for much more load than a minute of easy work.

You never edit ECO zones directly; they derive from the same thresholds. ECO is explained in [chapter 4](./04-dashboard-and-analysis.md#training-load-eco) and can be turned off entirely in **Settings → Training & planning**.

---

Next: [3. Importing and syncing your training →](./03-importing-and-syncing.md)
