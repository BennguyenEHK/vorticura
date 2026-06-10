import assert from 'assert';
import { dashboardReducer } from '@/hooks/search-dashboard-reducer';
import { initialDashboardState } from '@/types/search-progress';
import type { SearchProgressBody, SearchDashboardState } from '@/types/search-progress';

// =============================================
// Search dashboard reducer — itemsDone counter
// =============================================
// Regression for the "Items 0/9" bug: a sufficient REVIEW verdict must mark the
// item done and STAY done even when the later per-item density event reports a
// sub-floor source count. Previously the optimistic mark lived in `density` and
// was clobbered by that density event, pinning the counter at 0.

let seq = 0;
function batch(state: SearchDashboardState, ...bodies: SearchProgressBody[]): SearchDashboardState {
  const events = bodies.map((b) => ({ ...b, rfqId: 1, t: Date.now(), seq: ++seq }));
  return dashboardReducer(state, { type: 'batch', events });
}

// run-start establishes the denominator.
let s = batch(initialDashboardState(), { kind: 'run-start', itemsTotal: 2 });
assert.strictEqual(s.itemsTotal, 2, 'run-start sets itemsTotal');
assert.strictEqual(s.itemsDone, 0, 'fresh run starts at 0 done');

// Item 8 passes review as sufficient → counts as done immediately.
s = batch(s, { kind: 'review', itemId: 8, sufficient: true, kept: 6 });
assert.strictEqual(s.itemsDone, 1, 'sufficient review marks the item done');

// THE BUG: a later sub-floor density event for the SAME item must not undo it.
s = batch(s, { kind: 'density', itemId: 8, have: 0, need: 3 });
assert.strictEqual(s.itemsDone, 1, 'sub-floor density must not clobber a sufficient review');

// The density-floor path still independently counts items (no review event).
s = batch(s, { kind: 'density', itemId: 5, have: 3, need: 3 });
assert.strictEqual(s.itemsDone, 2, 'an item meeting the density floor also counts as done');

// A not-sufficient review does not count.
s = batch(s, { kind: 'review', itemId: 3, sufficient: false, kept: 1, reason: 'need more' });
assert.strictEqual(s.itemsDone, 2, 'a not-sufficient review does not increment done');

// A fresh run-start wipes the slate (including reviewedDone).
s = batch(s, { kind: 'run-start', itemsTotal: 4 });
assert.strictEqual(s.itemsDone, 0, 'run-start clears reviewedDone + density');
assert.deepStrictEqual(s.reviewedDone, {}, 'reviewedDone reset on run-start');

console.log('✓ testSearchDashboardReducer passed');
