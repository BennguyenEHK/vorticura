// =============================================
// ANALYZE-RFQ — End-to-end integration test
// =============================================
// Sends incoming_email through handleHTTPRequest → processAnalysis → AI → DB
// Then POSTs the result to the Next.js server so the SSE preview panel receives it.
// Run: npx tsx --env-file=.env.local tests/test_sequence/test-analyze-rfq.ts

import { handleHTTPRequest } from '@/lib/data-processor';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import { pool } from '@/lib/db/client';
import type { MergedAnalysisData } from '@/types/ai-agent';

// =============================================
// CONFIG
// =============================================

/** Next.js dev server URL — the SSE emit bridge */
const EMIT_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// =============================================
// WORKSPACE (required for DB operations)
// =============================================

const workspace = new WorkspaceContext({
  user_id: 1,
  company_id: 1,
  username: 'versempra',
  role: 'admin',
});

// =============================================
// TEST INPUT — Sequence 1.1: incoming_email → rfq_analysis/analyze
// =============================================

const SEQ_1_1_EMAIL = {
  data_type: 'incoming_email' as const,
  action_type: 'handleRFQ' as const,
  rfq_id: 1,
  workspace,
  incoming_email: {
    message_id: '<1976cf7a67e30462@mail.gmail.com>',
    from_email: 'hoanghuyco.sales@gmail.com',
    from_name: 'Hoang Huy Co., Ltd',
    to: ['bennguyenehk@gmail.com'],
    cc: [],
    subject: 'Hoang Huy] -RFQ for Provision of Materials for Valves of Air Dryer, PR 25-10337',
    email_body_text:
      'Dear Mr.Huy\r\n\r\nWe would invite your company to submit proposal for provision of goods and/or services to support our petroleum operation in the Block 15-2, Vung Tau, Vietnam as hereunder.\r\n\r\nWe would request that your proposal submitted must be strictly in compliance with this request for quotation and its applicable documents hereunder. The proposal should be in Vietnam currency, and valid for a period of no lesser than forty-five (45) days, unless otherwise quoted. By submission of proposal, your company is deemed to accept those aforesaid requirements of the Company.\r\n\r\nDescription and requirement: as per Attachment 1 hereunder.\r\n\r\nTender\'s Closing Time: 12:00 hours on 19-Jun-25.\r\n\r\nContract terms and condition: our standardized contract terms and condition is applied.\r\n\r\nProposal shall be submitted as below selected requirement, which is marked with R:\r\n\r\nOption b: via email by two separate emails i.e. one email for technical proposal, and other email for commercial proposal.\r\n\r\nKindly acknowledge receipt of this request and confirm your intention to submit proposal as soon as possible but not later than 12:00 hours on 7-Jun-25.\r\n\r\nNo | Maximo # | Description of Goods/Services <More details as per Attachment 2> | QTY (EA)\r\n1 | 217382 | Check valve, swing, 2\", 150#, RF (JVPC Spec A5R), CAPS order #155107, Crane 147XU 50NB Swing Check Valve. Tag: ACV1, ACV2 in drawing CCP-2898 for NULQ-SK-6111A/B | 4\r\n2 | 217376 | Valve, with Bettis CB415 actuator on Crane KF941, 2\", 150#, RF, for NULQ-SK-6111A/B | 4\r\n3 | 204985 | Valve, Ball, 2\", 150#, RF, Carbon Steel, Full Bore, ANSI B16-34, TVC KF941 | 4\r\n4 | 217377 | Repair kit for Bettis CB415 actuator, for NULQ-SK-6111A/B | 6\r\n5 | 217378 | Auto Drain Valve, CAPS order number 156091, for NULQ-SK-6111A/B | 2\r\n6 | 217375 | Valve, ball, 1-1/2inch, FB, 150#, RF, FV-1B, Outlet tower Left/Right, for NULQ-SK-6111C | 1\r\n7 | 217379 | Pressure safety Valve, Hydroseal Model: 4FRVOL, 1\" inlet/outlet, for NULQ-SK-6111C | 2\r\n8 | 215840 | Repair Kit for Metal Diaphragm Valve size 1-1/2\", Ingersoll Rand, P/N: 630392, Tower inlet valve (FV-1A), for Air Dryer | 1\r\n9 |  | Deliverables: CO, CQ, cert of compliance and other applicable certs by MFR | 1\r\n\r\nThank you and Kind regards,\r\n\r\nNguyen Ai Thanh Dan (Ms.)\r\nSupply Chain Group\r\n\r\nJapan Vietnam Petroleum Company\r\nA Subsidiary of ENEOS Xplora\r\n7th Fl, PetroVietnam Tower, 08 Hoang Dieu, W.1, Vung Tau City, S.R.Vietnam\r\nT 84-254-3856937, Ext. 366      HP 84-903007794\r\n\r\nThis email (including any attachments) may contain confidential information and is intended only for the person or entity to which it is addressed. Dissemination, distribution or copying of this email by anyone other than the intended recipient is prohibited.',
    attachments_parsed: [
      {
        filename: 'RFQ to HHUY_25-201.pdf',
        content_type: 'application/pdf',
        extracted_text:
          '[PDF – 453 KB. Not auto-extracted by Gmail Pub/Sub watcher. Expected: formal RFQ cover letter (Attachment 1) with scope, terms, and submission instructions for PR 25-10337.]',
      },
      {
        filename: 'RFQ_25-201_Att-2.pdf',
        content_type: 'application/pdf',
        extracted_text:
          '[PDF – 1.08 MB. Not auto-extracted by Gmail Pub/Sub watcher. Expected: Attachment 2 detailed technical datasheets and specifications for all 8 valve line items including drawings, standards, and MFR certs requirements.]',
      },
    ],
    received_at: '2025-06-14T05:44:05Z',
  },
};

// =============================================
// SSE BRIDGE — POST result to Next.js server
// =============================================

async function emitToPreview(result: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${EMIT_URL}/api/preview-stream/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    if (res.ok) {
      console.log('  [SSE] Result emitted to preview panel ✓');
      return true;
    }
    console.warn(`  [SSE] Emit failed: ${res.status} ${res.statusText}`);
    return false;
  } catch (err) {
    console.warn(`  [SSE] Could not reach Next.js server at ${EMIT_URL} (is dev server running?)`);
    return false;
  }
}

// =============================================
// RUNNER
// =============================================

async function main() {
  console.log('=== Analyze-RFQ Prompt Integration Test ===\n');

  const t1 = await handleHTTPRequest(SEQ_1_1_EMAIL);

  console.log('\n========================================');
  console.log('RESULT');
  console.log('========================================');
  console.log(`  success:     ${t1.success}`);
  console.log(`  data_type:   ${t1.data_type}`);
  console.log(`  action_type: ${t1.action_type}`);
  console.log(`  status:      ${t1.status}`);
  if (t1.error) console.log(`  error:       ${t1.error}`);
  if (t1.data) console.log(`  data:        ${JSON.stringify(t1.data, null, 2).slice(0, 500)}`);
  console.log(`  time:        ${t1.processing_time_ms}ms`);
  console.log('========================================');
  console.log(`  Test 1 (analyze): ${t1.success ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log('========================================\n');

  // ── Deterministic extraction validation ──
  if (t1.success && t1.data) {
    const data = t1.data as MergedAnalysisData;

    console.log('\n--- Extraction Validation ---');
    console.log(`  rfq_reference:     ${data.rfq_reference}`);
    console.log(`  expected:          RFQ PR-25-10337`);
    console.log(`  match:             ${data.rfq_reference === 'RFQ PR-25-10337' ? 'PASSED ✓' : 'FAILED ✗'}`);

    console.log(`  customer.email:    ${data.customer_info?.email}`);
    console.log(`  expected:          hoanghuyco.sales@gmail.com`);
    console.log(`  match:             ${data.customer_info?.email === 'hoanghuyco.sales@gmail.com' ? 'PASSED ✓' : 'FAILED ✗'}`);

    console.log(`  customer.phone:    ${data.customer_info?.phone}`);
    console.log(`  expected contains: 84-254`);
    console.log(`  match:             ${data.customer_info?.phone?.includes('84-254') ? 'PASSED ✓' : 'FAILED ✗'}`);

    console.log(`  rfq_items count:   ${data.rfq_items?.length}`);
    console.log(`  expected:          9`);
    console.log(`  match:             ${data.rfq_items?.length === 9 ? 'PASSED ✓' : 'FAILED ✗'}`);

    console.log(`  required_currency: ${data.required_currency}`);
    console.log(`  expected:          VND`);
    console.log(`  match:             ${data.required_currency === 'VND' ? 'PASSED ✓' : 'FAILED ✗'}`);

    console.log(`  deadline_period:   ${data.deadline_period}`);
    console.log(`  expected contains: 2025-06-19`);
    console.log(`  match:             ${data.deadline_period?.includes('2025-06-19') ? 'PASSED ✓' : 'FAILED ✗'}`);

    // AI-only fields (no exact match — just log for manual inspection)
    console.log('\n--- AI Fields (manual check) ---');
    console.log(`  company_name:      ${data.customer_info?.company_name}`);
    console.log(`  address:           ${data.customer_info?.customer_address}`);
    console.log(`  analysis_content:  ${data.rfq_analysis?.analysis_content?.slice(0, 100)}...`);
  }

  // Bridge: POST result to Next.js server so SSE clients (preview panel) receive it
  if (t1.success) {
    await emitToPreview(t1 as unknown as Record<string, unknown>);
  }

  await pool.end();
  if (!t1.success) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  pool.end().finally(() => process.exit(1));
});
