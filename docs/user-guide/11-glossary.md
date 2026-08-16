[← Guide index](./README.md)

# 11. Glossary

## Training concepts

**AeT / AnT** — Aerobic threshold and anaerobic (lactate) threshold. Used to label ECO zones.

**CSS** — Critical swim speed: the per-100 pace you can hold for a long continuous swim. What TiZ calls your swim threshold pace.

**De-load week** — See *rest week*.

**Discipline split** — How a week's total hours divide across swim, bike, and run. Defaults vary by phase kind; in "By discipline" planning mode you set each sport directly.

**ECO** — *Objective load equivalents*. A single training-load number per session, computed by weighting minutes in each of eight intensity zones and scaling by sport. Optional; see [chapter 4](./04-dashboard-and-analysis.md#training-load-eco).

**Fatigue** — Short-term accumulated training load, with a time constant of about 7 days.

**Fitness** — Long-term accumulated training load, with a time constant of about 42 days.

**Form** — Fitness minus fatigue. Positive means relatively fresh for your fitness level.

**FTP** — Functional threshold power: roughly the power you can hold for an hour. Your bike power threshold.

**LTHR** — Lactate threshold heart rate. Not maximum heart rate.

**MAP** — Maximal aerobic power. ECO zone 6.

**Mean-maximal power** — The best average power you sustained over a given duration. Plotted across many durations it forms a power curve.

**Mesocycle** — A roughly four-week block within a phase. Used to time de-loads, long weeks, and volume steps. Created automatically.

**Off week** — A week where the long session isn't done at full length, and an off-week policy applies instead. Distinct from a rest week.

**Phase** — A named multi-week block of a season with its own volume progression, zone focus, session counts, and weekly template. Kinds: Base, Build, Race prep, Taper.

**PMC** — Performance management chart: fitness, fatigue, and form plotted over time.

**Ramp** — Progressive weekly increase in volume, or in long-session duration, across a phase.

**Rest week** (also **de-load week**) — A recovery week at reduced volume, 75% of the previous training week by default. Marked with the **Rest** checkbox in Week review.

**RPE** — Rate of perceived exertion, 1 to 10. Collected in self-evaluation, not used as a workout target.

**Session role** — Easy, Moderate, Intensity, or Long. Drives which signal scores your TiZ (with role overrides), how zone budget is inherited from the pool, and how an unexpected RPE is interpreted.

**Test week** — A week marked for testing, which uses your test-week template when sessions are generated.

**TiZ** — *Time in zone*: minutes in each of five zones, Z1 to Z5, tracked per sport. The unit the whole app plans and measures in.

**Zone focus** — A named Z1–Z5 percentage distribution, for example "Aerobic base" or "Threshold". Applied per sport per phase to turn hours into a TiZ target.

**Z1–Z5** — The five TiZ planning zones, defined as percentages of your threshold. Distinct from the eight ECO zones and from the seven zones available as workout step targets.

## App concepts

**Activity** — A recorded workout that came from a file or from Strava. What you did.

**Attached program** — A program placed on a season, shown as a violet band on the season timeline.

**Component** — A reusable workout piece from a Warm-up, Main set, or Cool-down folder, dragged into the builder to assemble a workout.

**Day flag** — Your great / good / rough / bad rating of a standout day, used by Workout Signaling.

**Day quality** — Great, good, rough, or bad, derived from your feel rating and RPE.

**Materialize** — Generate calendar planned sessions from a phase's weekly template and volume targets.

**Planned session** — A row on the calendar: what you intend to do. Holds the sport, day, role, duration, zone budget, notes, tags, and optionally a structured workout.

**Planning mode** — How volume and TiZ are grouped: Overall, By discipline, Separate long workouts, or Separate long TiZ.

**Pool** (as in *workout pool*) — The week's remaining session budget: what the season says you should do, minus what's already on the calendar. Nothing to do with swimming pools.

**Pool week** — The week the workout pool is currently targeting, ringed in emerald on the calendar. Only its days accept pool drops.

**Pool size** — Your swimming pool's length: SCY (25 yards), SCM (25 metres), or LCM (50 metres).

**Primary metric** — The signal that scores your TiZ for a sport by default: power, pace, or heart rate.

**Relative pace target** — A workout target expressed by reference, like "10k pace" or "95% of 5k pace", which resolves against your race-pace anchors and follows your fitness.

**Season** — A date-bounded block of Monday-start weeks containing phases, races, and weekly targets.

**Signal** — A measurable stream: power, heart rate, or pace.

**Skeleton session** — A session with a sport, day, role, and duration but no step-level targets.

**Slot kind** — A pool budget type: Endurance, Intense, Long, or Endurance (sub). Determines the role assigned when you drop a pool card.

**Structured workout** — A step tree with targets, attachable to a planned session and exportable to a device.

**Program** — A reusable multi-week set of sessions positioned by day offset, applicable to any date range or attachable to a season. Same word in the library and on the season.

**Weekly template** — A reusable Monday-to-Sunday layout of sports, durations, and roles. Assigned to phases, rest weeks, and test weeks; applied to individual weeks with **Apply template**.

**Week target** — A season's computed budget for a given week: hours, TiZ minutes, and session counts per sport.

**Workout Signaling** — The feature that flags standout days and reports load patterns preceding good and bad sessions.

## Units and abbreviations

| Abbreviation | Meaning |
| --- | --- |
| **bpm** | Beats per minute (heart rate) |
| **W** | Watts (power) |
| **rpm** | Revolutions per minute (bike cadence) |
| **spm** | Steps per minute (run cadence) |
| **min/km**, **min/mi** | Run pace |
| **min/100m**, **min/100yd** | Swim pace |
| **km/h**, **mph** | Speed |
| **SCY / SCM / LCM** | Short course yards / short course metres / long course metres |
| **A / B / C race** | Race priority: A is the season's focus |
| **τ₁ / τ₂** | The fitness and fatigue time constants, about 42 and 7 days |

---

Next: [12. Configuration and administration →](./12-configuration.md)
