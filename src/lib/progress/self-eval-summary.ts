export type SelfEvalRow = {
  rpe: number | null;
  freshness: number | null;
  sleep: number | null;
  motivation: number | null;
  soreness: number | null;
};

export type SelfEvalSummary = {
  count: number;
  rpe: number | null;
  freshness: number | null;
  sleep: number | null;
  motivation: number | null;
  soreness: number | null;
};

function average(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (present.length === 0) return null;
  const mean = present.reduce((sum, v) => sum + v, 0) / present.length;
  return Math.round(mean * 10) / 10;
}

/** Average each self-evaluation metric across the rows that recorded it; null when none. */
export function summarizeSelfEval(rows: SelfEvalRow[]): SelfEvalSummary | null {
  if (rows.length === 0) return null;
  const summary: SelfEvalSummary = {
    count: rows.length,
    rpe: average(rows.map((r) => r.rpe)),
    freshness: average(rows.map((r) => r.freshness)),
    sleep: average(rows.map((r) => r.sleep)),
    motivation: average(rows.map((r) => r.motivation)),
    soreness: average(rows.map((r) => r.soreness)),
  };
  const hasAnyMetric = [
    summary.rpe,
    summary.freshness,
    summary.sleep,
    summary.motivation,
    summary.soreness,
  ].some((v) => v != null);
  return hasAnyMetric ? summary : null;
}
