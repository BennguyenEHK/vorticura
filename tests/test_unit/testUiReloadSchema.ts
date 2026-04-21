// Verifies ui_reload + ai_conversations tables exist with the expected columns.
// Runs via: npm run test (tsx)
import { db } from '../../lib/db/client';
import { sql } from 'drizzle-orm';

async function run() {
  const uiReloadCols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ui_reload' ORDER BY column_name
  `);
  const uiReloadNames = uiReloadCols.rows.map((r: any) => r.column_name as string).sort();
  const expectedUiReload = [
    'company_id', 'created_at', 'id', 'ui_state', 'ui_type', 'updated_at', 'user_id',
  ];
  if (JSON.stringify(uiReloadNames) !== JSON.stringify(expectedUiReload)) {
    throw new Error(`ui_reload columns mismatch: got ${JSON.stringify(uiReloadNames)}`);
  }

  const aiCols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ai_conversations' ORDER BY column_name
  `);
  const aiNames = aiCols.rows.map((r: any) => r.column_name as string).sort();
  const expectedAi = [
    'company_id', 'context_type', 'created_at', 'expires_at', 'id',
    'messages', 'model_id', 'rfq_id', 'rfq_reference', 'updated_at', 'user_id',
  ];
  if (JSON.stringify(aiNames) !== JSON.stringify(expectedAi)) {
    throw new Error(`ai_conversations columns mismatch: got ${JSON.stringify(aiNames)}`);
  }

  // queue_priority column removed — no longer part of rfq_analysis. Ordering
  // is now strictly by updated_at DESC (latest activity on top).
  console.log('OK: schema presence');
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
