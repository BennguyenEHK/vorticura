import assert from 'assert';
import { stripThinking, extractThinking, extractJson } from '@/lib/ai-agent/qwen-client';

// =============================================
// qwen-client — thinking-block stripping + JSON extraction
// =============================================
// Qwen3.6 emits <think>...</think> reasoning before the answer. These helpers
// strip/split that reasoning and recover JSON from the answer body (clean,
// fenced, or wrapped in prose).

// --- stripThinking ---
{
  assert.equal(
    stripThinking('<think>reasoning here</think>{"a":1}'),
    '{"a":1}',
    'removes think block',
  );
  assert.equal(
    stripThinking('{"a":1}'),
    '{"a":1}',
    'passes through text with no think block',
  );
}

// --- extractThinking ---
{
  const a = extractThinking('<think>step 1</think>{"ok":true}');
  assert.equal(a.thinking, 'step 1', 'splits thinking from answer (thinking)');
  assert.equal(a.text, '{"ok":true}', 'splits thinking from answer (text)');

  const b = extractThinking('{"ok":true}');
  assert.equal(b.thinking, null, 'returns null thinking when no block');
  assert.equal(b.text, '{"ok":true}', 'returns answer when no block');
}

// --- extractJson ---
{
  assert.deepEqual(extractJson<{ a: number }>('{"a":1}'), { a: 1 }, 'parses clean JSON');
  assert.deepEqual(
    extractJson<{ a: number }>('<think>x</think>{"a":1}'),
    { a: 1 },
    'strips think block then parses',
  );
  assert.deepEqual(
    extractJson<{ a: number }>('```json\n{"a":1}\n```'),
    { a: 1 },
    'handles markdown fences',
  );
  assert.equal(extractJson('not json at all'), null, 'returns null on garbage');
}

console.log('✓ qwen-client.test passed');
