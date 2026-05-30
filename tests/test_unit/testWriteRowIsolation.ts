import assert from 'assert';
import { handleWrite, type WriteFailure } from '@/lib/utils/databaseHandler';

// =============================================
// Per-row write isolation (resilience half of "9 items, only 3 saved")
// =============================================
// Confirmed root cause: an LLM-authored value overflowed a column, insertData()
// threw, and the write loop abandoned every subsequent row — silently. The clamp
// removes the likely trigger; this test locks the *structural* guarantee that one
// failing row can NEVER drop the rest of the batch, regardless of which column.

// Fake config: extracts 9 rows, always takes the INSERT path.
const NINE_ROWS = Array.from({ length: 9 }, (_, i) => ({ item_id: i + 1 }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeConfig: any = {
  table: 'supplierItemStatus',
  builder: (data: Record<string, unknown>) => ({ itemId: data.item_id }), // non-empty payload
  extract: () => NINE_ROWS,
  getExistsComposite: () => ({ rfqId: 1 }),
  getUpdateFilter: () => ({ rfqId: 1 }),
};

// Fake ops: getData → no existing rows (insert path); insertData throws on the
// 4th row (simulating the constraint violation on item #4), succeeds otherwise.
let insertAttempts = 0;
const insertedItemIds: number[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeOps: any = {
  getData: async () => [],
  insertData: async (_table: string, _cols: unknown, payload: Record<string, unknown>) => {
    insertAttempts++;
    if (payload.itemId === 4) throw new Error('value too long for type character varying(3)');
    insertedItemIds.push(Number(payload.itemId));
    return { id: insertAttempts };
  },
  updateData: async () => undefined,
};

(async () => {
  const failures: WriteFailure[] = await handleWrite(
    [fakeConfig],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { data_type: 'supplier_search', rfq_id: 1 } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {} as any, // workspace unused — DB ops are injected
    fakeOps,
  );

  // All 9 rows were attempted — the throw on #4 did NOT abort the batch.
  assert.equal(insertAttempts, 9, `all 9 rows must be attempted; got ${insertAttempts}`);

  // The 8 good rows persisted (everything except the throwing #4).
  assert.deepEqual(
    insertedItemIds.slice().sort((a, b) => a - b),
    [1, 2, 3, 5, 6, 7, 8, 9],
    'every row except the failing #4 must be inserted',
  );

  // The single failure is surfaced, not swallowed.
  assert.equal(failures.length, 1, 'one failure surfaced to the caller');
  assert.match(failures[0].error, /value too long/, 'failure carries the underlying DB error');

  console.log('✓ testWriteRowIsolation passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
