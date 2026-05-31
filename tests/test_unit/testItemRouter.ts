import assert from 'assert';
import {
  classifyItem,
  type RouteDecision,
} from '@/lib/services/search/item-router';

// =============================================
// Item Router — tiered effort classifier for RFQ items
// =============================================
// classifyItem() decides Tier 1 (deterministic direct, L2 in the memory
// hierarchy) vs Tier 3 (full LLM plan, L3) BEFORE the query planner runs.
//
// Tier-1 rule: text must contain BOTH a model/part token (alphanumeric +
//   extended chars, has at least one digit) AND a qualifier (purely alphabetic,
//   length >= 3). A bare code alone stays Tier 3 — bare codes have the weakest
//   signal and the planner earns its cost there.

// tsx emits cjs — top-level await is unsupported, so wrap the async assertions.
(async () => {

// --- Tier 1: model token + multiple qualifier words → direct query ---
{
  const text = 'Emerson Fisher DVC6200 valve positioner';
  const result: RouteDecision = classifyItem(text);
  assert.equal(result.tier, 1, 'specific model + brand qualifiers → Tier 1');
  assert.equal(result.directQuery, text.trim(), 'directQuery is the trimmed input');
}

// --- Tier 3: bare code alone, no qualifier word ---
{
  const result: RouteDecision = classifyItem('Z41H-16C');
  assert.equal(result.tier, 3, 'bare code with no qualifier → Tier 3');
  assert.equal(result.directQuery, undefined, 'directQuery absent for Tier 3');
}

// --- Tier 3: free-text description, no model/part token ---
{
  const result: RouteDecision = classifyItem('gate valve for water line');
  assert.equal(result.tier, 3, 'free-text description with no code → Tier 3');
  assert.equal(result.directQuery, undefined, 'directQuery absent for Tier 3');
}

// --- Tier 3: empty string ---
{
  const result: RouteDecision = classifyItem('');
  assert.equal(result.tier, 3, 'empty string → Tier 3');
  assert.equal(result.directQuery, undefined, 'directQuery absent for Tier 3');
}

// --- Tier 3: whitespace-only string ---
{
  const result: RouteDecision = classifyItem('   ');
  assert.equal(result.tier, 3, 'whitespace-only string → Tier 3');
}

// --- Tier 1: manufacturer prefix + code token + product-type qualifier ---
{
  const text = 'Kitz Z41H-16C gate valve';
  const result: RouteDecision = classifyItem(text);
  assert.equal(result.tier, 1, 'manufacturer + code + product-type → Tier 1');
  assert.equal(result.directQuery, text.trim(), 'directQuery is the trimmed input');
}

console.log('✓ testItemRouter passed');
})().catch((err) => { console.error(err); process.exit(1); });
