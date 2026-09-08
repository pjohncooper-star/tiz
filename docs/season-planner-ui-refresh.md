# Season planner UI refresh — design options

Status: **chosen and implemented.** Create is a 3-step wizard (A1–A2 plus races; no
load step). Manage is the Option B timeline workbench with Option C’s cross-phase
load table. All six items in [section 9](#9-fixes-worth-making-in-all-four) are
applied. See [chapter 5](./user-guide/05-season-planner.md).

The four options below are the historical design notes. The shipped product is
**A create + B manage + C load table**, with no dual UI and no feature flag.

The premise: the planner's capability set is fine, but `/plan` used to present all of
it at once, at one visual level, with three competing save models. This document keeps
every existing control and only changes where it lives and when it appears.

---

## 1. What is wrong with the page today

`src/components/simple-planner/simple-planner-view.tsx` (1,925 lines) renders one long
scroll of six collapsible sections, five of which are expanded on load.

| Problem | Where it shows up |
| --- | --- |
| No overview | Opening a season drops you into six simultaneous edit surfaces. There is no read-only "here is my season" state. |
| Three save models | Per-section `Save`/`Cancel`, a global `Save all`, and two separate `Save & recalculate volume` buttons. Which one persists what is not discoverable. |
| Flat phase editor | `PhaseDetailEditor` stacks nine fieldsets with no grouping: identity, week range, session counts, intense days, zone focus, volume progression, long sessions, ramp toggles, goal, delete, then a materialize panel. |
| Advanced settings at top level | `Default planning mode`, `Max hours per week`, planning units and phase-kind zone defaults sit at the same weight as races and phases. |
| Two-way scroll jumping | Selecting a week in the timeline scrolls the week table; selecting a phase in the week table force-expands and scrolls to the Phases section. |
| Undiscoverable happy path | After create you have zero phases. Nothing tells you the sequence is add phase, assign weeks, pick a weekly template, then Generate sessions. |
| Buried integration state | The TrainerRoad follow / stop-following control lives inside the Phases section. |
| Thin creation form | Create is name, dates and a TrainerRoad checkbox, and then you are on your own. |

None of the four options below removes a capability. Options A and C also reduce
`simple-planner-view.tsx` to routing plus shared state, since each step or drawer becomes
its own component.

---

## 2. Control inventory

Every option must give all of these a home. Referenced by ID in each option.

**Season (S)**
S1 name · S2 start/end dates · S3 default planning mode · S4 max hours per week ·
S5 rest-week volume % · S6 rest-week template · S7 test-week template ·
S8 phase-kind zone defaults · S9 planning units (hours vs distance plus reference pace,
per discipline) · S10 TrainerRoad follow / stop following · S11 archive

**Races (R)**
R1 A race name/date/disciplines (required) · R2 B races (add, edit, remove) ·
R3 C races (add, edit, remove)

**Programs (P)**
P1 attach from library · P2 anchor mode and date · P3 end-on-race anchor ·
P4 owns-hours/TiZ per discipline · P5 fill leftover TiZ · P6 paused weeks ·
P7 clash resolution · P8 remove

**Phase (F), per phase**
F1 kind (Base/Build/Race prep/Taper) · F2 label · F3 colour · F4 planning-mode override ·
F5 weekly template · F6 week range · F7 sessions per week (swim/bike/run/strength) ·
F8 intense days per week · F9 zone focus TiZ % (with start-to-end ramp) ·
F10 volume progression mode · F11 per-discipline start/end/rate/step/cap ·
F12 long ride/run start and end minutes · F13 long off-week policy and endurance % ·
F14 long-week checkbox grid · F15 ramp-by-discipline toggles · F16 phase goal note ·
F17 delete · F18 generate sessions (plus only-empty-weeks)

**Weeks (W)**
W1 week table with per-discipline hours and TiZ · W2 rest-week flag ·
W3 test-week flag · W4 phase band drag-resize · W5 add phase from gutter

**Views (V)**
V1 volume timeline with phase bands, race markers, program bars ·
V2 discipline filter · V3 ECO fitness/fatigue card · V4 season list ·
V5 links to Programs and New season

---

## 3. Option A — Create wizard, then a read-first overview

The strongest separation of concerns: creation is a short linear wizard, management is a
dashboard of summary cards that open focused editors. You never face more than one
editing surface at a time.

### A1. Create, step 1 of 4

```
  New season                                              Cancel

  (1) Basics ---- (2) Races ---- (3) Structure ---- (4) Load
  ==========      ..........     ..............     ........
  ---------------------------------------------------------------

   Name      [ 2026 Season                                     ]

   Starts    [ 2026-01-05 ]        Ends    [ 2026-07-05 ]
             Mon                           Sun

   +-----------------------------------------------------------+
   |  26 weeks - Mon 5 Jan to Sun 5 Jul                        |
   |  Dates snap to whole Monday-to-Sunday weeks.              |
   +-----------------------------------------------------------+

                                        [ Back ]  [ Next: Races ]
```

Holds S1, S2.

### A2. Create, step 3 of 4 — where structure comes from

The step that makes the TrainerRoad relationship explicit, instead of a checkbox buried
in a card.

```
  New season                                              Cancel

  (1) Basics ---- (2) Races ---- (3) Structure ---- (4) Load
  done            done           ==============     ........
  ---------------------------------------------------------------

   Where do phases come from?

   +-----------------------------------------------------------+
   | (o)  Follow TrainerRoad                            [ TR ] |
   |      Imports Base/Build/Specialty blocks that fall        |
   |      inside your season dates. Bike stays on the          |
   |      TrainerRoad feed; you plan swim, run and strength.   |
   |      Calendar connected - last synced 2 hours ago         |
   +-----------------------------------------------------------+
   | ( )  Suggest phases for me                                |
   |      Base 8 / Build 8 / Race prep 8 / Taper 2, scaled     |
   |      to 26 weeks.                                         |
   +-----------------------------------------------------------+
   | ( )  Start empty                                          |
   |      Draw phases yourself on the week grid.               |
   +-----------------------------------------------------------+

   Preview
   +-----------------------------------------------------------+
   |  Base 1    Base 2    Build 1   Build 2   Spec   Tpr  |A|  |
   |  [=====]   [=====]   [=====]   [=====]   [===]  [=]       |
   |   w1-6      w7-12     w13-17    w18-21   22-24  25-26     |
   +-----------------------------------------------------------+

                                        [ Back ]  [ Next: Load ]
```

Holds S10, plus a phase-suggestion path that today requires manually clicking
`+ Add phase` and typing week ranges six times.

### A3. Season overview — the management screen

Read-first. Nothing is an input until you open an editor.

```
  2026 Season                                          Active
  Mon 5 Jan - Sun 5 Jul - 26 weeks - following TrainerRoad
                                Programs | Seasons v | ...
  =================================================================

  Volume                        All | Swim | Bike | Run     Edit >
  h/wk
   12 |                                  .-'''-.
    9 |                    .-''''''-.  .'       '.
    6 |      .-''''''-.  .'          ''          '.
    3 |  .-''                                      '--.
      +----------------------------------------------------
      | Base 1 | Base 2 | Build 1 | Build 2 | Spec | Tpr |A|
        ^rest    ^rest     ^test     ^rest

  =================================================================

  +--------------------------+   +------------------------------+
  | Races                >   |   | Phases                    >  |
  |                          |   |                              |
  | A  Roth            5 Jul |   | 6 phases, all weeks assigned |
  |    Swim - Bike - Run     |   | 4 have a weekly template     |
  | B  Kraichgau      12 May |   | 2 still need one       [ ! ] |
  | C  Local 10k      22 Feb |   |                              |
  +--------------------------+   +------------------------------+

  +--------------------------+   +------------------------------+
  | Programs             >   |   | Sessions on calendar      >  |
  |                          |   |                              |
  | 12wk Swim Block          |   | Generated   w1 - w12         |
  |   owns swim hours        |   | Not yet     w13 - w26        |
  | + Attach program         |   |     [ Generate sessions ]    |
  +--------------------------+   +------------------------------+

  +-------------------------------------------------------------+
  | Weeks                                                    >  |
  |                                                             |
  | Wk  Dates         Swim    Bike    Run    Total              |
  |  1  5-11 Jan      2.0h    4.0h    2.0h    8.0h              |
  |  2  12-18 Jan     2.1h    4.2h    2.1h    8.4h              |
  |  3  19-25 Jan     2.2h    4.4h    2.2h    8.8h              |
  |  4  26-1 Feb      1.7h    3.3h    1.7h    6.6h   rest       |
  |                                      Show all 26 weeks >    |
  +-------------------------------------------------------------+

  Season settings, units and defaults                          >
  Fitness / fatigue preview                                    >
```

Cards map to: Races R1-R3 · Phases F1-F18 · Programs P1-P8 · Sessions F18 ·
Weeks W1-W5 · Settings S3-S9 and S11 · V1-V3.

The `[ ! ]` on the Phases card is the fix for the undiscoverable happy path. The overview
states what is blocking `Generate sessions`, rather than letting you discover it by
finding a disabled button.

### A4. Phase editor drawer

Opened from the Phases card, or by clicking a band on the timeline. The nine flat
fieldsets become four tabs, ordered by the question each one answers.

```
   (overview dimmed behind)     +-------------------------------+
                                | Build 2          w18-21   [x] |
                                | ----------------------------- |
                                | Shape | LOAD | Intens | Layout|
                                | ----------------------------- |
                                |                               |
                                | Progression                   |
                                |  ( ) Ramp to a target         |
                                |  (o) Percent per week         |
                                |  ( ) Fixed step per week      |
                                |                               |
                                |         Start    Rate    Cap  |
                                | Swim  [chain ]  [ 5 %] [ 4.0 ]|
                                | Bike   from TrainerRoad       |
                                | Run   [ 3.5  ]  [ 4 %] [ 5.5 ]|
                                |                               |
                                | [x] swim ramps  [x] run ramps |
                                |                               |
                                | +---------------------------+ |
                                | | 7.5h -> 9.2h over 4 weeks | |
                                | |                     .-'   | |
                                | |            .-'''''''      | |
                                | +---------------------------+ |
                                |                               |
                                | Long sessions                 |
                                | Long run  [ 90 ] -> [ 120 ] m |
                                | Off weeks [ Endurance 60%  v ]|
                                |                               |
                                |         [ Cancel ]  [ Apply ] |
                                +-------------------------------+
```

Tab contents:

| Tab | Controls |
| --- | --- |
| Shape | F1 kind, F2 label, F3 colour, F6 week range, F16 goal, F17 delete |
| Load | F10 progression, F11 per-discipline values, F15 ramp toggles, F12 long minutes, F13 off-week policy, F4 planning-mode override (under Advanced) |
| Intensity | F7 sessions per week, F8 intense days, F9 zone focus TiZ % |
| Layout | F5 weekly template, F14 long-week grid, F18 generate sessions |

`Apply` writes to the in-memory draft and closes the drawer. A single sticky
`Save season` bar persists and recalculates. One save model instead of three.

**Pros.** Cleanest first impression. Creation and management stop competing for the same
screen. Read-first means a season is glanceable. Naturally mobile-friendly.
**Cons.** Largest rewrite. Drawer editing costs a click for anyone who wants to sweep
across four phases quickly.

---

## 4. Option B — Timeline workbench with a context inspector

One canvas, one inspector. Closest to how a coach works: point at a thing, edit that
thing. Desktop-first.

```
  2026 Season v   26 wks   TrainerRoad    * unsaved     [ Save ]
  ===============================================================
 SEASONS |  CANVAS                          |  INSPECTOR
         |                                  |
 2026    |  h/wk      All | Sw | Bk | Rn    |  Phase: Build 2
 Season  |   12 |            .-'-.          |
 active  |    9 |     .-'-.'     '.         |  Kind  [ Build   v ]
         |    6 | .-'-'           '-.       |  Label [ Build 2    ]
 2025    |    3 |'                   '-.    |  Weeks  18 - 21
 Season  |      +----------------------     |
 done    |      |Base1|Base2|Bld1|Bld2|Sp|  |  -- Sessions / wk --
         |      |     |     |    |####|  |  |  Swim [3]  Bike  TR
 + New   |      +----------------------     |  Run  [3]  Str  [2]
         |       ^rest ^test      ^prog     |
         |                                  |  -- Intense days --
         |  WEEKS                           |  Swim [1]  Run  [2]
         |  Wk Dates     Sw   Bk   Rn  R T  |
         |  17 27 Apr   2.4  5.0  2.4  .  . |  -- Zone focus ----
         |  18 4 May    2.5  5.2  2.5  .  . |  Z1 [=====   ]  45%
         |  19 11 May   2.6  5.4  2.6  .  . |  Z2 [====    ]  30%
         |  20 18 May   2.0  4.1  2.0  x  . |  Z3 [==      ]  15%
         |  21 25 May   2.7  5.6  2.7  .  x |  Z4 [=       ]  10%
         |  22 1 Jun    2.8  5.8  2.8  .  . |
         |                                  |  -- Volume --------
         |  Drag a band edge to move a      |  (o) % per week
         |  boundary. Click + in the        |  Swim [chain][ 5 %]
         |  gutter to add a phase.          |  Run  [ 3.5 ][ 4 %]
         |                                  |
         |                                  |  Weekly template
         |                                  |  [ Build week    v ]
         |                                  |  [ Generate ... ]
         |                                  |
         |                                  |  Advanced         >
```

The inspector swaps on selection, so one strip of real estate serves five object types:

```
  nothing selected   ->  Season   S1 S2 S3 S4 S5 S6 S7 S8 S9 S10 S11
  phase band         ->  Phase    F1 .. F18
  week row           ->  Week     W2 W3, per-discipline hours and TiZ
  race marker        ->  Race     R1 R2 R3
  program bar        ->  Program  P2 .. P8
```

**Pros.** No scrolling between a thing and its settings. Two-way scroll-jumping
disappears, because selection becomes the only navigation. Fast for sweeping edits across
phases. Reuses `simple-planner-timeline.tsx` and `simple-planner-week-table.tsx` nearly
as-is.
**Cons.** Needs a real mobile fallback, with the inspector as a bottom sheet. Does not
solve first-run guidance on its own, so it wants Option A's create wizard alongside it.

---

## 5. Option C — Persistent stepper

The most literal answer to "could it be broken into steps", without trapping you in a
modal wizard. Five steps that stay visitable forever, each with completion state.
Creation and management are the same screens; a new season simply has nothing checked off
yet, so there is one code path rather than two.

```
  2026 Season           Mon 5 Jan - Sun 5 Jul - 26 wks    [ Save ]
  =================================================================

  (v) 1 Season   (v) 2 Races   (o) 3 Phases   ( ) 4 Load   ( ) 5 Gen
      done           done          current        2 to do    blocked
  -----------------------------------------------------------------

  h/wk |                  .-'''-.                        All  v
       | .-'''-.  .-'''-.'       '.
       +-------------------------------------------
       |Base1|Base2|Bld1|Bld2|Spec|Tpr|A|

  =================================================================

  Step 3 - Phases

  Split the season into blocks. Each block gets its own volume and
  intensity in step 4.

  +--------+ +--------+ +--------+ +--------+ +------+ +-------+
  | Base 1 | | Base 2 | | Bld 1  | | Bld 2  | | Spec | | + Add |
  | w1-6   | | w7-12  | | w13-17 | | w18-21 | |w22-26| |       |
  | Base   | | Base   | | Build  | | Build  | | Race | |       |
  | tmpl v | | tmpl v | | tmpl v | | none ! | |tmpl v| |       |
  +--------+ +--------+ +--------+ +--------+ +------+ +-------+

  Phases come from TrainerRoad. Names and week ranges are read-only
  while you follow the feed.                   [ Stop following ]

  Wk  Dates          Phase        Rest   Test
   1  5-11 Jan       Base 1        [ ]    [ ]    <- drag edges here
   2  12-18 Jan      Base 1        [ ]    [ ]
   3  19-25 Jan      Base 1        [ ]    [ ]
   4  26-1 Feb       Base 1        [x]    [ ]

  [ ! ] 2 phases still need a weekly template before step 5 can run.

                        [ Back: Races ]   [ Next: Load ]
```

Step 4 then handles load for every phase in one comparable table, which is the one thing
neither A nor B does well.

```
  (v) 1 Season   (v) 2 Races   (v) 3 Phases   (o) 4 Load   ( ) 5 Gen
  -----------------------------------------------------------------

  Step 4 - Load                          Units: hours    Change >

  Progression for all phases:   ( ) Target  (o) % / week  ( ) Step

           | Base 1  | Base 2  | Build 1 | Build 2 | Spec  | Taper
  ---------+---------+---------+---------+---------+-------+-------
  Swim  h  | 2.0 +5% | chain5% | chain4% | chain4% | hold  | -40%
  Bike  h  |   from TrainerRoad calendar
  Run   h  | 2.0 +5% | chain5% | chain4% | chain4% | hold  | -40%
  Str  /wk |    2    |    2    |    2    |    1    |   1   |   0
  ---------+---------+---------+---------+---------+-------+-------
  Peak     |  2.6h   |  3.5h   |  4.3h   |  5.2h   | 5.2h  |  3.1h

  Rest weeks at [ 75 ]% of the prior training week.
  Max [ 12 ] h/week - week 21 is the highest at 11.0h.

  Long sessions                                    Advanced      >
  Long run    90 -> 150 min across the season   [ Edit grid ]
  Long ride   from TrainerRoad

                      [ Back: Phases ]   [ Next: Generate ]
```

Steps map to: 1 = S1-S4 and S9-S11 · 2 = R1-R3 · 3 = F1-F6, F17, W2-W5 ·
4 = F7-F15, S5, S8 · 5 = F5, F18, P1-P8.

**Pros.** Directly answers "break it into steps" while staying revisitable. Step 4's
cross-phase table is genuinely better than per-phase editing for setting up a ramp. The
`blocked` label on step 5 makes prerequisites legible. One set of screens serves both
create and edit.
**Cons.** Step 4's table grows wide once several planning modes are in play. Small edits
cost navigation. Closest in spirit to the unbuilt six-step wizard whose problems are
recorded in `docs/plan-wizard-pain-points.md`, so that doc is worth re-reading before
committing to this direction.

---

## 6. Option D — Same page, restructured

Lowest-risk refresh. Keeps one scrolling page and the existing components, and fixes only
the layout, the save model and the basic/advanced split. Roughly a third of the work of
Option A.

```
  2026 Season  26 wks  TrainerRoad     * 3 unsaved  Discard | Save
  =================================================================
  h/wk |           .-'''-.                        All | Sw | Bk | Rn
       | .-'-..-'-'      '.
       +-------------------------------
       |Base1|Base2|Bld1|Bld2|Sp|T|A|
  =================================================================
  On this page  |
                |  RACES
  Races         |  +----------------------------------------------+
  Phases    [!] |  | A  [ Roth        ]  [ 2026-07-05 ]  Sw Bk Rn |
  Load          |  | B  [ Kraichgau   ]  [ 2026-05-12 ]  Sw Bk Rn |
  Weeks         |  | + B race    + C race                         |
  Programs      |  +----------------------------------------------+
  Generate      |
                |  PHASES                          2 need a tmpl !
  -----------   |  +--------+ +--------+ +--------+ +--------+
  Settings      |  | Base 1 | | Base 2 | | Build 1| | Build 2|
  Units         |  | w1-6   | | w7-12  | | w13-17 | | w18-21 |
  Defaults      |  +--------+ +--------+ +--------+ +--------+
  Archive       |
                |  Editing Build 2
                |  +----------------------------------------------+
                |  | Shape | LOAD | Intensity | Layout            |
                |  | -------------------------------------------- |
                |  | Progression   (o) % per week                 |
                |  |           Start      Rate      Cap           |
                |  | Swim    [ chain  ]  [ 5 % ]  [ 4.0 ]         |
                |  | Run     [ 3.5    ]  [ 4 % ]  [ 5.5 ]         |
                |  | Bike      from TrainerRoad                   |
                |  |                                              |
                |  | Advanced (planning mode, off-week policy)  > |
                |  +----------------------------------------------+
```

What changes, concretely:

1. One save bar with a dirty count. Per-section `Save`/`Cancel`, `Save all` and both
   `Save & recalculate volume` buttons all go; recalculation becomes implicit.
2. A sticky left rail replaces the six collapsible headers, so the timeline stays visible
   and nothing scroll-jumps.
3. The phase editor gains the same four tabs as Option A.
4. S3, S4, S8 and S9 move into a `Settings` rail item; F4 and F13 move behind a per-phase
   `Advanced` disclosure.
5. Section headings carry blocking state (`2 need a tmpl !`) instead of staying silent.

**Pros.** Incremental, shippable in pieces, no data or route changes, keeps power-user
density. **Cons.** Still one long page, and it does not fix the thin creation flow, so it
needs A1 and A2 alongside it at minimum.

---

## 7. Comparison

| | A Wizard + overview | B Workbench | C Stepper | D Restructured |
| --- | --- | --- | --- | --- |
| First-run guidance | Best | Weak alone | Best | Weak alone |
| Glanceability | Best | Medium | Medium | Low |
| Speed of bulk edits | Low | Best | Best for ramps | Medium |
| Mobile | Good | Needs bottom sheet | Good | Medium |
| Fixes save-model confusion | Yes | Yes | Yes | Yes |
| Fixes scroll-jumping | Yes | Yes | Yes | Yes |
| Reuses timeline and week table | Partly | Almost fully | Fully | Fully |
| Invasiveness | High | Medium-high | Medium | Low |

---

## 8. Recommendation

**A1 and A2 for creation, plus B for management.** The create wizard is where the
guidance problem actually lives, and it is cheap because it is a new route rather than a
refactor of a 1,925-line component. The workbench is the better daily surface, because
season editing is inherently "point at a block, change that block", and it preserves the
timeline and week-table components that already work.

Borrow one screen from Option C whichever shell wins: the **cross-phase load table**.
Comparing ramps across phases side by side is the one thing no per-phase editor can do,
and it is where the volume model is easiest to get wrong.

Option D is the fallback if the appetite is a refresh rather than a rebuild. Its first
two changes — one save bar, sticky rail — are worth doing on their own, and they are a
stepping stone toward A or B rather than wasted work.

---

## 9. Fixes worth making in all four

Independent of which shell wins.

1. **One save model.** A single dirty-state bar. `recalculate: true` is an implementation
   detail and should not be a user-facing button.
2. **Name the modes in athlete language.** `SEPARATE_LONG_TIZ` currently surfaces as
   "Separate long TiZ", with helper text reading "Modes 3-4 include the long in Sessions
   per week" — which requires knowing the list order. Describe the outcome instead, for
   example "Plan the long ride and long run separately from weekly hours".
3. **Show prerequisites where the blocked action is.** `Generate sessions` stays disabled
   until a phase has both weeks and a weekly template. Say so on the phase card, not only
   in amber text beside the disabled button.
4. **Lift TrainerRoad state out of the Phases section** into the header, so "what owns my
   bike training" is answered on arrival.
5. **Group the advanced settings.** S3, S4, S8, S9, F4 and F13 are each configured at
   most once a season and should not share visual weight with races and phases.
6. **Open fewer sections by default.** Five of six are expanded on load today, which is
   what makes the page feel overbuilt even though each individual control is reasonable.
