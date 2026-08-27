[← Guide index](./README.md)

# 1. Getting started

## Creating an account

Go to `/register`.

| Field | Notes |
| --- | --- |
| **Name** | Required. Used as your display name. |
| **Email** | Required. This is your login. |
| **Password** | Required, minimum 8 characters. No other complexity rules. |

Press **Register**. If the email is already in use you get "Email taken".

Registration does **not** log you in — you are sent to `/login` to sign in with the credentials you just created. Behind the scenes, creating an account also creates your athlete profile with estimated default thresholds, default signal preferences, and default per-sport settings, so nothing is empty when you start.

## Signing in

Go to `/login`, enter your email and password, and press **Sign in**. A wrong password gives "Invalid email or password".

If you have forgotten your password, use **Forgot password?** on the sign-in page. Enter the email on the account; if it matches, TiZ emails a link that is valid for one hour. Open the link, choose a new password (minimum 8 characters), then sign in. The same response is shown whether or not the email exists, so a typo will look like success.

After signing in you land on `/`, which immediately forwards you to wherever you left off:

- If onboarding is unfinished, you go to the step you stopped on.
- If onboarding is complete, you go to the **Dashboard**.

Everything except the login, register, password-reset, and Strava callback/webhook routes requires you to be signed in.

**Sign out** is at the bottom of the sidebar.

## Onboarding

Onboarding is five steps, run once. The header reads **TiZ onboarding**, and each step after the first has a **← Back to [previous step]** link.

Onboarding is one-way: once you finish, revisiting a setup page will *not* drop you back into the onboarding flow. Everything you set here stays editable afterwards in **Settings**.

### Step 1 — Profile

> *"Tell us your name, then set current and historical thresholds before importing."*

One required field, **Your name**. Press **Continue to thresholds**.

### Step 2 — Current thresholds

This is the full thresholds editor — the same one you'll find later under **Settings → Thresholds & paces**. You set your best guess for today's FTP, threshold run pace, threshold swim pace, and LTHRs, choose your primary metric per sport, and optionally customize zone boundaries.

Estimates are fine. Chapter 2 explains every field, what each number does, and how zones are derived from it. Values **autosave when you leave a field**, so there is no separate save step; **Continue to historical thresholds** flushes anything still focused and moves on.

**Why this comes before import:** the app scores each imported activity into zones using the thresholds that were in effect *on that activity's date*. If you import first and set thresholds later, your old activities get scored against today's fitness.

### Step 3 — Historical thresholds

> *"Add threshold and primary-metric changes with effective dates before importing workouts."*

Entirely optional but worth doing if you are importing years of history and your fitness has moved. You can add:

- **Threshold entries** — pick a **Discipline**, a **Signal** (power, heart rate, or pace), an **Effective from** date, and the value. Each entry applies from its date forward until the next entry.
- **Primary metric changes** (bike and run only) — for example, "I trained by heart rate until March 2024, then switched to power." Includes optional per-session-role overrides.

Validation: paces must be `mm:ss` (for example `5:30`), power and heart rate must be positive numbers, and every row needs an effective date.

Press **Continue to historical import** when you're done, with or without entries.

### Step 4 — Historical import

> *"Zip your export folder, then upload the .zip file."*

Pick an **Export source** label (**Garmin Connect export**, **Strava bulk export**, or **TrainingPeaks export**) — this only labels the batch for your records; parsing is identical for all three today. Then drag your `.zip` onto the drop zone, or click to browse.

Chapter 3 covers what file types work, what happens in the background, how long it takes, and what to do if it stalls. In short: zip your whole export folder, upload it, and watch the progress bar.

You can press **Skip for now** and import later, though Workout Signaling needs at least nine months of history before it activates.

When parsing finishes, press **Continue to Strava connect**. Zone computation may still be running in the background — that's expected and doesn't block you.

### Step 5 — Connect Strava

> *"For ongoing activities after your historical import."*

Press **Connect Strava** to run the OAuth flow. On success, your last 30 Strava activities sync immediately, onboarding is marked complete, and you land on the Dashboard. New activities then arrive automatically via webhook.

**Skip for now** also completes onboarding and takes you to the Dashboard. You can connect later from **Settings → Integrations**.

**Known limitation:** Strava does not allow `localhost` as an OAuth callback domain, so you cannot connect Strava from a local development server unless you put an HTTPS tunnel (for example ngrok) in front of it and register that domain with your Strava app.

## What to do next

Once onboarding is done, a good order is:

1. **Check the Dashboard.** Confirm the activity count looks right and that recent workouts show zone breakdowns. If activities show "no usable signal", see [chapter 10](./10-troubleshooting.md).
2. **Add your race paces** in **Settings → Thresholds & paces** if you run. These let workouts prescribe "10k pace" or "95% of 5k pace" instead of fixed numbers, which then follow your fitness automatically. See [chapter 7](./07-workout-library.md#relative-pace-targets).
3. **Set units** in **Settings → Units & display** — metric or imperial per sport, plus your default pool size.
4. **Build a season** in **Seasons** ([chapter 5](./05-season-planner.md)). This is what gives the calendar its weekly targets and session budget.
5. **Plan your first week** on the **Calendar** ([chapter 6](./06-planning-calendar.md)).

You do not need a season to use the calendar — you can add sessions to any day by hand. But without one, the workout pool and week targets stay empty, because both come from the season plan.

---

Next: [2. Thresholds and zones →](./02-thresholds-and-zones.md)
