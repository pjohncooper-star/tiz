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
