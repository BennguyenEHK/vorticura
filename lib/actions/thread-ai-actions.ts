// =============================================
// THREAD AI ACTIONS — Server actions for items_ordering AI features
// =============================================
// Called from items-ordering-document.tsx (client component) for:
//   - AI thread summary: summarize supplier email thread on row select
//   - AI draft reply: pre-fill reply textarea when operator clicks "AI Draft Reply"

'use server';

import { hfChatCompletion } from '@/lib/ai-agent/hf-client';

interface ThreadMsg {
  direction: 'outbound' | 'inbound';
  subject: string;
  body: string;
  from_email: string;
  sent_at: string | null;
}

const SUMMARY_SYSTEM_PROMPT = `You summarize supplier email threads for procurement operators. Return ONLY valid JSON: {"text": "1-2 sentence summary of what was discussed and current status"}`;

const DRAFT_REPLY_SYSTEM_PROMPT = `You write professional procurement email replies. Return ONLY valid JSON: {"text": "email body only, plain text, no greeting line, concise and professional"}`;

/** Generate a concise AI summary of a supplier's email thread */
export async function generateAIThreadSummary(
  thread: ThreadMsg[],
  supplierName: string,
  itemName: string,
): Promise<string> {
  if (thread.length === 0) return '';
  const threadText = thread
    .map(m => `[${m.direction === 'outbound' ? 'You' : supplierName}]: ${m.body}`)
    .join('\n\n');
  const result = await hfChatCompletion<{ text: string }>(
    SUMMARY_SYSTEM_PROMPT,
    `Supplier: ${supplierName}\nItem: ${itemName}\n\nThread:\n${threadText}`,
  );
  return result.text ?? '';
}

/** Generate an AI draft reply for the operator to review before sending */
export async function generateAIDraftReply(
  thread: ThreadMsg[],
  supplierName: string,
  itemName: string,
): Promise<string> {
  const threadText = thread.length > 0
    ? thread.map(m => `[${m.direction === 'outbound' ? 'You' : supplierName}]: ${m.body}`).join('\n\n')
    : '(No prior messages — this is the first follow-up)';
  const result = await hfChatCompletion<{ text: string }>(
    DRAFT_REPLY_SYSTEM_PROMPT,
    `Write a follow-up reply to ${supplierName} regarding item: ${itemName}\n\nThread context:\n${threadText}`,
  );
  return result.text ?? '';
}
