# TiZ — Time in Zone

Multisport training POC: time-in-zone planning, bulk historical import, Workout Signaling, Strava sync.

## Setup

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:generate
npm run dev
```

Run Inngest dev server in another terminal:

```bash
npx inngest-cli@latest dev
```

Add `INNGEST_DEV=1` to `.env` for local development (already in `.env.example`).

## Deploy to production

See **[DEPLOY.md](DEPLOY.md)** for the full guide to deploy at `https://www.tizplanner.com` (Vercel + Neon + Inngest + Namecheap DNS).

## Strava API (production)

1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api):
   - **Website:** `https://www.tizplanner.com`
   - **Authorization Callback Domain:** `www.tizplanner.com` (hostname only)
2. Set env vars on your host (see `.env.example`):
   - `AUTH_URL=https://www.tizplanner.com`
   - `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`
   - `STRAVA_WEBHOOK_VERIFY_TOKEN` (random secret)
   - `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (unset `INNGEST_DEV`)
3. Deploy TiZ so `https://www.tizplanner.com/api/webhooks/strava` is reachable over HTTPS.
4. Register the app-level webhook (one-time per Strava app):

```bash
npm run strava:register-webhook
```

5. Connect Strava from **Settings** or onboarding step 5. New activities sync via webhooks → Inngest.

**Local OAuth:** Strava does not allow `localhost` as a callback domain. Use your deployed URL or an HTTPS tunnel (e.g. ngrok) added to the Strava app.

## Onboarding flow

1. **Profile & thresholds** — best-guess FTP/pace/CSS (estimated OK)
2. **Threshold history** — effective-dated entries
3. **Bulk import** — upload Garmin or Strava export zip (.fit/.tcx/.gpx)
4. **Strava connect** — ongoing sync
5. **Day flags** — tag great/good/rough/bad standout days → v0 Workout Signaling

## Stack

Next.js · PostgreSQL · Prisma · Auth.js · Inngest · @garmin/fitsdk

## Phases

- **Phase 0** (this build): onboarding + import + zones + Strava
- **Phase 1**: day-quality flagging + Workout Signaling v0
- **Phase 2**: plan builder + templates + FIT/ZWO export
- **Phase 3–5**: surveys, consent, refined signaling
