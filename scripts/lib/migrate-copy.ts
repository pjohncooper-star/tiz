export const DEFAULT_BATCH_SIZE = 500;

/**
 * Insert rows in batches with progress logging.
 * Returns total rows reported inserted by insertBatch (may be less with skipDuplicates).
 */
export async function copyManyBatched<T>(
  label: string,
  rows: T[],
  batchSize: number,
  insertBatch: (batch: T[]) => Promise<number>
): Promise<number> {
  if (rows.length === 0) {
    console.log(`  ${label}: 0`);
    return 0;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    inserted += await insertBatch(batch);
    const done = Math.min(i + batch.length, rows.length);
    console.log(`  ${label}: ${done}/${rows.length}`);
  }
  console.log(`  ${label}: ${inserted} inserted (${rows.length} rows)`);
  return inserted;
}

/** Filter to rows whose id is not already on the target. */
export function rowsMissingById<T extends { id: string }>(
  sourceRows: T[],
  existingIds: Set<string>
): T[] {
  return sourceRows.filter((r) => !existingIds.has(r.id));
}
