[← Guide index](./README.md)

# 12. Configuration and administration

This chapter is for whoever runs the app rather than for athletes using it. For a full deployment walkthrough — Vercel, Neon, Inngest, DNS, and the schema migrations — see [DEPLOY.md](../../DEPLOY.md) at the repository root.

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js (App Router), React, Tailwind CSS |
| Database | PostgreSQL via Prisma |
| Auth | Auth.js with email and password credentials |
| Background jobs | Inngest |
| Activity parsing | `@garmin/fitsdk`, plus TCX and GPX parsers |
| Reference deployment | Vercel + Neon + Inngest |

## Running locally

```bash
cp .env.example .env     # then fill in DATABASE_URL and NEXTAUTH_SECRET
npm install
npm run db:push
npm run db:generate
npm run dev
```

Background jobs need either an Inngest dev server or inline processing:

```bash
npm run dev:all          # Next.js and the Inngest dev server together
```

Setting `INNGEST_DEV=1` in `.env` (which `.env.example` already does) makes imports and zone computation run inline in the Next.js process, which is usually enough for local work.

Run the test suite with `npm test`, and lint with `npm run lint`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Use the pooled string on Neon. |
| `AUTH_URL` | Yes | The app's public origin. Must match exactly, including `www`, or OAuth redirects break. |
| `NEXTAUTH_SECRET` | Yes | Session encryption key. Generate 32 random bytes. |
| `RESEND_API_KEY` | For password reset email | From [Resend](https://resend.com). Without it, reset requests log a link locally instead of sending mail. |
| `EMAIL_FROM` | For password reset email | Verified sender, e.g. `TiZ <noreply@tizplanner.com>`. Required together with `RESEND_API_KEY`. |
| `STRAVA_CLIENT_ID` | For Strava | From the Strava API settings page |
| `STRAVA_CLIENT_SECRET` | For Strava | From Strava |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | For Strava webhooks | A random secret; must match the value used when registering the webhook |
| `INNGEST_EVENT_KEY` | In production | From the Inngest dashboard |
| `INNGEST_SIGNING_KEY` | In production | From the Inngest dashboard |
| `INNGEST_DEV` | Local only | `1` processes jobs inline. **Never set this in production** — imports and Strava sync will hang. |

## Feature flags

Three flags gate large parts of the app. Each must be exactly `true` (or `1`) to enable.

| Variable | Enables | Effect when off |
| --- | --- | --- |
| `FEATURE_PLAN_BUILDER` | The season planner at `/plan` and its APIs | **Seasons** disappears from the sidebar; `/plan` is blocked |
| `FEATURE_SIMPLE_SEASON_PLANNER` | The volume-first season planner and season materialization | Season create, update, and materialize APIs are unavailable |
| `FEATURE_PLANNING_CALENDAR` | The planning calendar, weekly templates, and the iCal feed | **Calendar** disappears; `/calendar` redirects to the dashboard |

A derived flag, **session planning**, is on when *either* `FEATURE_PLAN_BUILDER` or `FEATURE_PLANNING_CALENDAR` is on. It gates the **Workouts** library, session detail pages, structured workouts, tags, search, and activity-to-session auto-linking.

In practice you want all three enabled; `.env.example` sets them that way. `GET /api/plan/planner-mode` reports which flags the server currently sees, which is the quickest way to diagnose a missing sidebar item.

Note that ECO training load is **not** an environment flag — it is a per-athlete setting under **Settings → Training & planning**.

## Strava server setup

1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api). Set **Website** to your app URL and **Authorization Callback Domain** to the **hostname only** — `www.example.com`, not a full URL.
2. Set `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_WEBHOOK_VERIFY_TOKEN`, and make sure `AUTH_URL` matches the deployed origin exactly.
3. Deploy, so `https://your-domain/api/webhooks/strava` is reachable over HTTPS.
4. Register the webhook once per Strava app:

```bash
npm run strava:register-webhook
```

Athletes then connect individually from **Settings → Integrations**.

The OAuth callback is `{AUTH_URL}/api/strava/callback`, and TiZ requests `read` and `activity:read_all` scopes. Strava will not accept `localhost` as a callback domain, so local Strava testing requires an HTTPS tunnel registered with the app.

## Background jobs

Registered Inngest functions:

| Function | Trigger | Work |
| --- | --- | --- |
| `process-import-batch` | Zip upload | Parses staged activity files |
| `compute-activity-zones` | New or changed activity | Computes TiZ zones and the ECO score |
| `recompute-zones-range` | Threshold or signal-preference change | Rescores a date range for a discipline |
| `sync-strava-activity` | Strava webhook | Fetches and stores one activity |
| `generate-v0-insights` | Regenerate insights, or saving day flags | Runs Workout Signaling analysis |

Bulk-import zone backfill and single-file upload scoring run inline rather than through Inngest.

Confirm these appear in the Inngest dashboard after deploying. If they don't, imports will stage files and then stop.

Bulk imports stage extracted files under `.data/imports/{jobId}/`. On ephemeral or multi-instance hosting, those files must remain visible to whatever process runs the import job — otherwise use co-located workers or persistent storage.

## Administration scripts

Run with `DATABASE_URL` set in the environment.

### Users

| Command | Purpose |
| --- | --- |
| `npm run user:list` | List recent users with emails and password status |
| `npm run user:reset-password <email> <password>` | Reset a password (minimum 8 characters). Fallback if self-service email is not configured. |
| `npm run user:delete <email> --confirm` | Delete a user and all their athlete data |
| `npm run user:migrate-to-prod <email> --confirm` | Copy a full athlete graph between databases, using `SOURCE_DATABASE_URL` and `TARGET_DATABASE_URL`. Supports `--resume`. |
| `npm run user:dedup-activities <email> --dry-run\|--confirm` | Merge duplicate activities, keeping the richest copy and repointing surveys and session links |

### Strava

| Command | Purpose |
| --- | --- |
| `npm run strava:register-webhook` | Register the app-level webhook. Once per Strava app. |
| `npm run strava:backfill-swim-laps <email> --dry-run\|--confirm` | Re-fetch Strava swim laps and recompute zones, for swims that arrived without usable lap data |

### Database

| Command | Purpose |
| --- | --- |
| `npm run db:push` | Push the schema to an empty database |
| `npm run db:migrate` | Prisma migrate, for local development |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:migrate:*` | Apply a specific idempotent manual SQL migration |

The `db:migrate:*` scripts correspond to feature migrations — planning modes, phase templates, the template library, phase volume progression, programs, workout tags, race pace anchors, session time ordering, program session ids, and season program attachment. Apply the relevant one against production before or immediately after deploying the matching code. Each is idempotent, and `DEPLOY.md` documents what the larger ones change.

### Unlisted maintenance scripts

Several scripts in `scripts/` are not wired into `package.json` but are useful when an import goes wrong:

| Script | Purpose |
| --- | --- |
| `scripts/check-import.mjs` | Inspect an import job's status, staged manifest, and pending zone count |
| `scripts/finish-import.mjs` | Force-complete a stuck import job |
| `scripts/reset-import.mjs` | Wipe an athlete's activities, import jobs, and Strava connection, and reset onboarding to the import step |
| `scripts/backfill-eco.ts` | Recompute zones and ECO for activities missing a load score |
| `scripts/import-local-zips.ts` | Import zips from disk, bypassing the web upload |

`reset-import.mjs` is destructive — it deletes activities. It is also currently the only way to fully disconnect an athlete's Strava account short of editing the database directly.

## Self-hosting checklist

1. Node 20 or newer, PostgreSQL, and HTTPS if you want Strava.
2. Copy `.env.example` to `.env` and fill it in, including the three feature flags.
3. `npm run db:push`, then `npm run build`, then `npm start`.
4. Configure Inngest — the dev server locally, or Inngest Cloud with both keys in production.
5. Register the Strava webhook against your public URL.
6. Make sure `.data/imports/` is writable, and persistent if import processing runs in a separate process.
7. Apply any needed `db:migrate:*` SQL migrations.

## Known gaps worth tracking

[Chapter 13](./13-known-limitations.md) is the full list. The ones most likely to generate support requests, all of which need database or script access to resolve:

- **No Strava disconnect in the UI** — requires removing the connection row.
- **Strava updates and deletes are ignored** — only new-activity webhooks are handled, so TiZ silently diverges from Strava after an edit.
- **Duplicate activities outside the fuzzy-match window** — requires `user:dedup-activities`.
- **Activity dates fall back to UTC** when a file carries no offset, so sessions can land on a neighbouring day.
- **Bulk import is only linked during onboarding** — afterwards athletes need the direct `/onboarding/import` URL.
- **Stuck imports** — `check-import.mjs`, `finish-import.mjs`, and `reset-import.mjs` are the tools.

## A note on other documents in `docs/`

Several documents in `docs/` describe intent rather than the current app. [Chapter 13](./13-known-limitations.md#documents-that-describe-features-that-do-not-exist) lists which are shipped, which are partly shipped, and which are unbuilt proposals.

This user guide describes the app as built.

---

[← Guide index](./README.md)
