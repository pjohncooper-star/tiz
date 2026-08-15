[← Guide index](./README.md)

# 8. Workout Signaling

Every athlete has days that go unexpectedly badly and days that go unexpectedly well. Workout Signaling looks at what you did in the days *before* those sessions and reports patterns: what tends to precede your bad days, and what tends to precede your good ones.

It is a pattern finder over your own history, not a general theory of training. Its answers are specific to you, and only as good as the flags you feed it.

Open **Workout Signaling** in the sidebar.

## The signaling gate

Signaling needs enough history to find anything. The **Signaling gate** card shows a progress bar toward **nine months** of activities with computed zones.

| State | Message |
| --- | --- |
| No activities | "Import your training history to unlock Workout Signaling." |
| Under nine months | "Import N more months of history to activate Workout Signaling." |
| Nine months or more | "Workout Signaling is active for your imported history." |

The bar reads `X / 9 months`, and once active it also shows how many days are eligible.

Nine months is not arbitrary: with less, a "pattern" across a handful of bad days is almost certainly noise. If you have a Garmin or Strava export covering a few years, do the bulk import ([chapter 3](./03-importing-and-syncing.md)) and this activates immediately.

## Flagging standout days

> *"Tag memorable days as great, good, rough, or bad. Workouts you rated on Garmin are pre-flagged from how they felt. Include rough days — contrast drives the insights above."*

The **Flag standout days** card is where you supply the outcomes. Four flags per workout: **great**, **good**, **rough**, **bad**.

A calendar picker highlights days with unflagged activities. Each activity row shows its name, time, discipline, a **PR** badge where relevant, and — if the rating came from your watch — a line like *"Garmin rating: felt strong · 7/10 effort → flagged great"*.

**Your flagged days** summarizes your counts per flag. A status line tells you how many activities remain unflagged. Press **Save flags** when done, or **Back to dashboard**.

### Pre-flagging from your device

If you answered Garmin's post-workout prompts, TiZ has already flagged those sessions:

| How it felt | Flag |
| --- | --- |
| Very weak | bad |
| Weak | rough |
| Normal | good |
| Strong or Very strong | great |

An RPE that contradicts the session's role can override this — an "easy" run you rated 7 out of 10 gets flagged bad regardless of how you rated the feel, because that mismatch is the signal. The full derivation is in [chapter 4](./04-dashboard-and-analysis.md#self-evaluation).

You can change any pre-flagged day; your flag wins.

### Flag the bad days

The single most common way to get nothing useful out of this feature is to flag only your good days. The analysis works by **contrast**: it compares what preceded good sessions against what preceded bad ones. With no bad days there is nothing to compare against, and generation needs at least three of each before it will produce anything.

Being honest about rough weeks is what makes this work.

## Insights

The **Insights** card lists what was found. Each insight has:

- A badge: **Risk** (amber) or **Protective** (green).
- A plain-language headline, for example: *"Rough/bad run workouts were more often preceded within 72h by a bike workout with overextended Z3 than good run workouts."*
- The sample size (`n=…`) and a note on confidence with the underlying counts.

**Risk** patterns are more common before your rough and bad days. **Protective** patterns are more common before your good and great ones. Up to three of each are kept, ordered by sample size.

### How patterns are found

For each flagged workout, TiZ looks at the **one to three workouts immediately preceding it** within a lookback window, and characterizes each of those against your own historical distribution:

- **Overextended Z2 / Z3 / Z4** — that session had unusually *high* time in that zone for you, above roughly your 75th–80th percentile.
- **Light Z2 / Z3 / Z4** — unusually low, at or below your 20th percentile.
- **Overextended or light ECO** — the same idea applied to overall training load, when ECO is enabled.

It then compares how often each pattern precedes bad outcomes versus good ones. A pattern only becomes an insight when the gap between those rates clears your sensitivity threshold.

Note that "overextended" is relative to *you*, not to any external standard. The insight is "this was a lot of Z3 by your standards", which is the only comparison that means anything.

### Controls

| Control | Options | Default |
| --- | --- | --- |
| **Sensitivity** | Standard, Sensitive, Exploratory, Debug | Sensitive |
| **Preceding workout window** | 24 hours, 48 hours, 72 hours | 72 hours |
| **Regenerate insights** | — | — |

> *"Only workouts in this window before a flagged workout count as triggers."*

Sensitivity is the size of the rate gap a pattern must clear: Standard wants a large difference (around 25 percentage points), Sensitive about half that, Exploratory much less, and Debug almost none. Standard gives you few but sturdy findings; Exploratory gives you many, most of which are noise. Start at the default and move toward Standard if you want to act on something.

The window is how far back a "preceding workout" can be. 24 hours asks "what did I do yesterday"; 72 hours asks "what did I do over the last three days". Longer windows catch cumulative fatigue; shorter ones catch same-day-after effects.

**Regenerate insights** re-runs the analysis with your current settings, replacing the previous results. Regenerating is cheap — changing the window from 72 to 24 hours and re-running is a reasonable way to probe whether an effect is immediate or cumulative.

If nothing is found: *"No insights yet. Regenerate to scan flagged workouts for risk and protective load patterns."*

### ECO patterns

Some patterns are expressed in terms of total training load rather than a single zone. Those need **Show ECO training load** enabled in **Settings → Training & planning**. With ECO off, they are hidden, and turning ECO off deletes existing ECO-based insights.

## How to read the results

A few cautions worth keeping in mind:

- **These are correlations from a small sample.** An insight with `n=4` is a hint, not a finding. Watch whether it survives more data.
- **Confounds are everywhere.** "Bad runs follow hard bike days" may be about fatigue, or about the fact that you schedule hard bike days on the same weekday as your hardest runs.
- **A protective pattern is not a prescription.** "Good runs follow light Z2 days" doesn't mean more easy days are always better; it means that in your history, easy days preceded your better runs.
- **Your flags are the measurement.** If you flag by how a session went rather than how you felt, or you flag inconsistently, the output changes accordingly.

Used well, this is a good way to notice something you'd otherwise miss — that your bad Sunday long runs almost always follow a Saturday with unusually high Z3, say — and then test it by changing the schedule and re-running the analysis a month later.

---

Next: [9. Settings reference →](./09-settings.md)
