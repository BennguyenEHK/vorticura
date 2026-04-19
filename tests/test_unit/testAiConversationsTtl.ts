// Verifies getAiConversations excludes rows whose expires_at is in the past.
import { db } from '../../lib/db/client';
import { aiConversations, rfqAnalysis } from '../../lib/db/schema';
import { getAiConversations, deleteExpiredAiConversations } from '../../lib/db/queries';
import { WorkspaceContext } from '../../lib/middleware/workspace-context';
import { eq, sql } from 'drizzle-orm';

// Picks the newest RFQ in the DB for FK integrity.
async function pickRfq() {
  const [row] = await db.select().from(rfqAnalysis).orderBy(sql`${rfqAnalysis.rfqId} DESC`).limit(1);
  if (!row) throw new Error('No rfq_analysis rows in DB — seed one first.');
  return row;
}

async function run() {
  const rfq = await pickRfq();
  const ws = new WorkspaceContext({ user_id: rfq.userId!, company_id: rfq.companyId });

  // Seed one valid + one already-expired row
  const [valid] = await db.insert(aiConversations).values({
    companyId: rfq.companyId,
    userId: rfq.userId!,
    rfqId: rfq.rfqId,
    messages: [{ role: 'user', content: 'fresh', timestamp: new Date().toISOString() }],
    contextType: 'analysis',
  }).returning();

  const [expired] = await db.insert(aiConversations).values({
    companyId: rfq.companyId,
    userId: rfq.userId!,
    rfqId: rfq.rfqId,
    messages: [{ role: 'user', content: 'old', timestamp: new Date().toISOString() }],
    contextType: 'analysis',
    expiresAt: new Date(Date.now() - 60_000), // already expired
  }).returning();

  try {
    const rows = await getAiConversations(rfq.rfqId, ws, 'analysis');
    const ids = rows.map((r: any) => r.id as number);
    if (!ids.includes(valid.id)) throw new Error('valid row missing from result');
    if (ids.includes(expired.id)) throw new Error('expired row leaked into result');

    const deleted = await deleteExpiredAiConversations();
    if (deleted < 1) throw new Error('deleteExpiredAiConversations should remove ≥1 row');

    const stillThere = await db.select().from(aiConversations).where(eq(aiConversations.id, expired.id));
    if (stillThere.length !== 0) throw new Error('expired row not actually deleted');

    console.log('OK: ai_conversations TTL behavior');
  } finally {
    // Clean up valid row (expired was deleted by deleteExpiredAiConversations)
    await db.delete(aiConversations).where(eq(aiConversations.id, valid.id));
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
