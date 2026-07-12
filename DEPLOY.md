# Deploy TiZ to www.tizplanner.com

This guide uses **Vercel** (Next.js hosting), **Neon** (PostgreSQL), and **Inngest** (background jobs). Domain DNS stays at **Namecheap**.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (you have this locally)
- [Git](https://git-scm.com/download/win) — required to connect Vercel to your code
- [GitHub](https://github.com/) account
- [Vercel](https://vercel.com/) account (free tier works)
- [Neon](https://neon.tech/) account (free tier works)
- [Inngest](https://www.inngest.com/) account (free tier works)

---

## 1. Database (Neon)

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. Copy the **pooled** connection string (`postgresql://...?sslmode=require`).
3. On a **new empty database**, push the schema from your machine:

```powershell
cd C:\Users\pjohn\TiZ
$env:DATABASE_URL="postgresql://..."   # your Neon URL
npx prisma db push
```

> If you already have a Neon DB that was set up incrementally, run the `manual_*.sql` files in `prisma/migrations/` via the Neon SQL editor instead of `db push`.

**Incremental DB catch-up (recommended):**

```powershell
npm run db:sync-schema
```

This runs all season + calendar migrations in order, then `prisma generate`. Options:

- `npm run db:sync-season` — season planner columns only
- `npm run db:sync-calendar` — calendar / PlannedSession columns only
- `node scripts/sync-db-schema.mjs --season-only` or `--calendar-only`

**Do not run** `manual_season_plan.sql` (legacy macrocycle schema).

---

## 2. Push code to GitHub

```powershell
cd C:\Users\pjohn\TiZ
git init
git add .
git commit -m "Initial TiZ deploy"
```

Create a new repo on GitHub, then:

```powershell
git remote add origin https://github.com/YOUR_USER/tiz.git
git branch -M main
git push -u origin main
```

---

## 3. Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) → **Import** your GitHub repo.
2. Framework preset: **Next.js** (auto-detected).
3. Before deploying, add **Environment Variables** (Production):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon pooled connection string |
| `AUTH_URL` | `https://www.tizplanner.com` |
| `NEXTAUTH_SECRET` | Random secret (see below) |
| `STRAVA_CLIENT_ID` | From [Strava API settings](https://www.strava.com/settings/api) |
| `STRAVA_CLIENT_SECRET` | From Strava |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Random secret |
| `INNGEST_EVENT_KEY` | From Inngest dashboard (after step 4) |
| `INNGEST_SIGNING_KEY` | From Inngest dashboard (after step 4) |

**Do not set** `INNGEST_DEV` in production.

Generate secrets on Windows:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. Click **Deploy** and wait for the build to finish.

---

## 4. Inngest (background jobs)

Imports, zone compute, and Strava sync run through Inngest.

1. Create an app at [app.inngest.com](https://app.inngest.com).
2. Add your Vercel project via the **Vercel integration**, or manually set the app URL to:
   `https://www.tizplanner.com/api/inngest`
3. Copy `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` into Vercel env vars.
4. **Redeploy** on Vercel so the new keys are picked up.
5. In Inngest, confirm these functions appear: `process-import-batch`, `compute-activity-zones`, `sync-strava-activity`, etc.

---

## 5. Custom domain (Namecheap → Vercel)

### In Vercel

1. Project → **Settings** → **Domains**
2. Add `www.tizplanner.com`
3. Add `tizplanner.com` (optional; redirect apex → www)

Vercel shows the DNS records you need.

### In Namecheap

1. [Domain List](https://ap.www.namecheap.com/domains/list/) → **Manage** `tizplanner.com`
2. **Advanced DNS** tab
3. Remove parking-page records if present
4. Add:

| Type | Host | Value |
|------|------|-------|
| `CNAME` | `www` | `cname.vercel-dns.com` |
| `A` | `@` | `76.76.21.21` |

(Use the exact values Vercel shows if they differ.)

5. Wait 5–30 minutes for DNS propagation.
6. Vercel will issue a free SSL certificate automatically.

---

## 6. Strava (after HTTPS is live)

1. [strava.com/settings/api](https://www.strava.com/settings/api):
   - **Website:** `https://www.tizplanner.com`
   - **Authorization Callback Domain:** `www.tizplanner.com`
2. From your machine (with production env vars in `.env`):

```powershell
$env:AUTH_URL="https://www.tizplanner.com"
npm run strava:register-webhook
```

3. In the app: **Settings** → **Connect Strava**

---

## 7. Verify

- [ ] `https://www.tizplanner.com` loads the login page (not Namecheap parking)
- [ ] Register a test account
- [ ] Complete onboarding
- [ ] Inngest dashboard shows healthy functions
- [ ] Strava connect + webhook sync (optional)

---

## Redeploying after changes

Push to `main` on GitHub — Vercel auto-deploys.

```powershell
git add .
git commit -m "Your change"
git push
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails on Vercel | Check build logs; run `npm run build` locally first |
| `DATABASE_URL is not set` | Add env var in Vercel → redeploy |
| OAuth / Strava redirect mismatch | `AUTH_URL` must be exactly `https://www.tizplanner.com` |
| Imports or Strava sync hang | Inngest keys missing or `INNGEST_DEV` still set |
| Domain shows parking page | DNS not pointed to Vercel yet; check Namecheap CNAME |
| 500 on login | Neon connection string wrong; check Neon project is active |
| Calendar: `column does not exist` on `PlannedSession` | DB schema is behind Prisma. Run `npm run db:sync-schema` (or `npm run db:sync-calendar`), then restart the dev server |
| Plan: `Could not create season` | Usually fixed by pulling latest code (transaction read bug) **and** running `npm run db:sync-schema` if Prisma reports missing columns |
