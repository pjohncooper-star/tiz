<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Numeric form inputs

Do not use raw `<input type="number">` with immediate `Number(...)` parsing on `onChange`. Users must be able to clear the field while editing.

Use shared blur-commit editors from `@/components/number-editor-input`:

- **`NumberEditorInput`** — numeric values (`value: number | null`, `onCommit` on blur/Enter). Set `nullable` when empty should commit `null`. Set `integer={false}` for decimals.
- **`TextEditorInput`** — string display values (duration minutes, formatted distance/speed strings) with the same blur-commit UX.

Specialized editors (`DurationEditorInput`, `PaceEditorInput`, `GoalTimeInput`, `PlannerPaceInput`) already follow this pattern — prefer them when they fit.

## Manual Neon migrations

When a change needs a manual SQL migration (`prisma/migrations/manual_*.sql` + `npm run db:migrate:…`), always tell the user:

1. The npm script to run (with `DATABASE_URL` set to production Neon), **and**
2. A **clickable GitHub link** to the SQL file on `main` (or the PR branch before merge), e.g. `https://github.com/pjohncooper-star/tiz/blob/main/prisma/migrations/<file>.sql`, so they can paste it into the Neon SQL Editor.
