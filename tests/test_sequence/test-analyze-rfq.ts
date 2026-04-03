/**
 * =============================================
 * ANALYZE-RFQ PROMPT — Integration Test
 * =============================================
 * Tests buildAnalyzeUserMessage + buildReanalyzeUserMessage
 * end-to-end via hfChatCompletion (HuggingFace Inference API).
 *
 * Run:  npx tsx --env-file=.env.local tests/test_sequence/test-analyze-rfq.ts
 *
 * Prerequisites: HF_TOKEN must be set in .env.local
 *
 * Test 1: Analyze — sends Seq 1.1 HVAC RFQ email → saves output1.json
 * Test 2: Reanalyze — reads output1.json, applies mock feedback → saves output2.json
 */

import fs from 'fs';
import path from 'path';

// --- Only importing from hf-client.ts and analyze-rfq.ts ---
import { hfChatCompletion } from '@/lib/ai-agent/hf-client';
import {
  ANALYZE_RFQ_PROMPT,
  buildAnalyzeUserMessage,
  buildReanalyzeUserMessage,
} from '@/lib/ai-agent/prompt/analyze-rfq';

// =============================================
// OUTPUT DIRECTORY
// =============================================

const OUTPUT_DIR = path.join(process.cwd(), 'tests', 'output');
const OUTPUT_FILE_1 = path.join(OUTPUT_DIR, 'analyze-rfq-output1.json');
const OUTPUT_FILE_2 = path.join(OUTPUT_DIR, 'analyze-rfq-output2.json');

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// =============================================
// TEST DATA — Seq 1.1 Input (HVAC RFQ email from Json_method_plan.md)
// =============================================

/** Raw email data matching the Json_method_plan.md Sequence 1.1 input */
const SEQ_1_1_EMAIL = {
  fromEmail: 'james.rodriguez@pacificclimate.com',
  fromName: 'James Rodriguez',
  to: ['sales@ourcompany.com'],
  cc: ['lisa.park@pacificclimate.com', 'robert.thompson@pacificclimate.com'],
  subject: 'RFQ - HVAC Equipment for Marina Boulevard Project',
  emailBodyText:
    'Dear Sir/Madam,\n\n' +
    'We would like to request a quotation for the following HVAC equipment ' +
    'for our Marina Boulevard project (total area 5000 sqm).\n\n' +
    'Our company: Pacific Climate Solutions Ltd.\n' +
    'Address: 88 Marina Boulevard, #12-05, Singapore 018956\n' +
    'Contact: Mr. James Rodriguez\n' +
    'Phone: +65 6789 1234\n' +
    'Fax: +65 6789 1240\n\n' +
    'Please quote the following items:\n\n' +
    '1. Industrial Chiller Unit, 50-Ton Capacity (Model ICU-50T) — Qty: 2 SETS\n' +
    '2. Air Handling Unit with Heat Recovery, 15000 CFM (Model AHU-15K-HR) — Qty: 1 SET\n' +
    '3. Variable Refrigerant Flow (VRF) Outdoor Unit, 24HP (Model VRF-24HP) — Qty: 5 EA\n\n' +
    'Requirements:\n' +
    '- Energy efficiency ratings required\n' +
    '- Singapore-compliant refrigerants (R-410A or R-32)\n' +
    '- BACnet integration capability\n' +
    '- Quotation needed within 14 business days\n\n' +
    'Best regards,\nJames Rodriguez\nPacific Climate Solutions Ltd.',
  attachments: [
    {
      filename: 'RFQ-HVAC-2026.pdf',
      contentType: 'application/pdf',
      extractedText:
        'ITEM 1: Industrial Chiller Unit, 50-Ton Capacity, Qty: 2 SETS. ' +
        'R-410A refrigerant, digital scroll compressor, energy-saving mode required. ' +
        'ITEM 2: Air Handling Unit with Heat Recovery, 15000 CFM, Qty: 1 SET. ' +
        'MERV 14 filtration, VFD included. ' +
        'ITEM 3: Variable Refrigerant Flow (VRF) Outdoor Unit, 24HP, Qty: 5 EA. ' +
        'Inverter technology, BACnet protocol, simultaneous heating/cooling.',
    },
    {
      filename: 'floor-plan-specs.png',
      contentType: 'image/png',
      extractedText:
        'Floor plan showing HVAC zones A through D, total area 5000 sqm. ' +
        'Zone A: 1500 sqm office space. Zone B: 2000 sqm retail. ' +
        'Zone C: 1000 sqm storage. Zone D: 500 sqm server room.',
    },
  ],
};

/** Mock feedback for reanalyze (matches Seq 1.3 example) */
const MOCK_REANALYZE_FEEDBACK = {
  generalFeedback:
    'The analysis missed the delivery deadline requirement mentioned in the PDF',
  inlineNotes: [
    {
      selectedText: '50-Ton Capacity',
      comment:
        'Customer specified 60-Ton in the PDF attachment on page 3, paragraph 2',
    },
    {
      selectedText: 'No clarification needed',
      comment:
        'Actually we need to clarify the voltage requirements - 380V or 415V?',
    },
  ],
};

// =============================================
// HELPER — save JSON to file
// =============================================

function saveOutput(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  -> Saved to: ${path.relative(process.cwd(), filePath)}`);
}

// =============================================
// TEST 1: buildAnalyzeUserMessage → hfChatCompletion
// =============================================

async function testAnalyze(): Promise<boolean> {
  console.log('\n========================================');
  console.log('TEST 1: Analyze RFQ (buildAnalyzeUserMessage)');
  console.log('========================================');

  // Step 1: Build user message from Seq 1.1 email data
  const attachmentsText = SEQ_1_1_EMAIL.attachments
    .map((a) => `[${a.filename}]\n${a.extractedText}`)
    .join('\n\n');

  const userMsg = buildAnalyzeUserMessage({
    subject: SEQ_1_1_EMAIL.subject,
    emailBodyText: SEQ_1_1_EMAIL.emailBodyText,
    fromEmail: SEQ_1_1_EMAIL.fromEmail,
    fromName: SEQ_1_1_EMAIL.fromName,
    cc: SEQ_1_1_EMAIL.cc,
    attachmentsText,
  });

  console.log('\n--- User Message (preview, first 300 chars) ---');
  console.log(userMsg.slice(0, 300) + '...\n');

  // Step 2: Call HuggingFace Inference API
  console.log('  Calling hfChatCompletion with ANALYZE_RFQ_PROMPT...');
  const startTime = Date.now();

  try {
    const result = await hfChatCompletion<Record<string, unknown>>(
      ANALYZE_RFQ_PROMPT,
      userMsg
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  AI responded in ${elapsed}s`);

    // Step 3: Validate structure has expected top-level keys
    const hasReport = 'report' in result;
    const hasCustomer = 'customer_info' in result;
    const hasItems = 'rfq_items' in result;

    console.log(`  Validation:`);
    console.log(`    report:        ${hasReport ? 'PASS' : 'FAIL'}`);
    console.log(`    customer_info: ${hasCustomer ? 'PASS' : 'FAIL'}`);
    console.log(`    rfq_items:     ${hasItems ? 'PASS' : 'FAIL'}`);

    // Step 4: Save output
    saveOutput(OUTPUT_FILE_1, result);

    const passed = hasReport && hasCustomer && hasItems;
    console.log(`\n  TEST 1: ${passed ? 'PASSED' : 'FAILED'}`);
    return passed;
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`  ERROR after ${elapsed}s:`, err);
    console.log('\n  TEST 1: FAILED (exception)');
    return false;
  }
}

// =============================================
// TEST 2: buildReanalyzeUserMessage → hfChatCompletion
// =============================================

async function testReanalyze(): Promise<boolean> {
  console.log('\n========================================');
  console.log('TEST 2: Reanalyze RFQ (buildReanalyzeUserMessage)');
  console.log('========================================');

  // Step 1: Read output from Test 1
  if (!fs.existsSync(OUTPUT_FILE_1)) {
    console.error('  ERROR: output1 not found. Test 1 must pass first.');
    console.log('\n  TEST 2: SKIPPED');
    return false;
  }

  const previousAnalysis = fs.readFileSync(OUTPUT_FILE_1, 'utf-8');
  console.log(`  Loaded previous analysis (${previousAnalysis.length} chars)`);

  // Step 2: Build reanalyze user message with mock feedback
  const userMsg = buildReanalyzeUserMessage({
    subject: SEQ_1_1_EMAIL.subject,
    previousAnalysis,
    generalFeedback: MOCK_REANALYZE_FEEDBACK.generalFeedback,
    inlineNotes: MOCK_REANALYZE_FEEDBACK.inlineNotes,
  });

  console.log('\n--- User Message (preview, first 300 chars) ---');
  console.log(userMsg.slice(0, 300) + '...\n');

  // Step 3: Call HuggingFace Inference API
  console.log('  Calling hfChatCompletion with ANALYZE_RFQ_PROMPT...');
  const startTime = Date.now();

  try {
    const result = await hfChatCompletion<Record<string, unknown>>(
      ANALYZE_RFQ_PROMPT,
      userMsg
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  AI responded in ${elapsed}s`);

    // Step 4: Validate structure
    const hasReport = 'report' in result;
    const hasCustomer = 'customer_info' in result;
    const hasItems = 'rfq_items' in result;

    console.log(`  Validation:`);
    console.log(`    report:        ${hasReport ? 'PASS' : 'FAIL'}`);
    console.log(`    customer_info: ${hasCustomer ? 'PASS' : 'FAIL'}`);
    console.log(`    rfq_items:     ${hasItems ? 'PASS' : 'FAIL'}`);

    // Step 5: Save output
    saveOutput(OUTPUT_FILE_2, result);

    const passed = hasReport && hasCustomer && hasItems;
    console.log(`\n  TEST 2: ${passed ? 'PASSED' : 'FAILED'}`);
    return passed;
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`  ERROR after ${elapsed}s:`, err);
    console.log('\n  TEST 2: FAILED (exception)');
    return false;
  }
}

// =============================================
// MAIN — run both tests sequentially
// =============================================

async function main() {
  console.log('=== Analyze-RFQ Prompt Integration Test ===');
  console.log(`Model: ${process.env.HF_MODEL_ID || 'mistralai/Mistral-7B-Instruct-v0.3 (default)'}`);
  console.log(`Output dir: ${path.relative(process.cwd(), OUTPUT_DIR)}`);

  // Test 1 must finish before Test 2 (needs output1.json)
  const t1 = await testAnalyze();
  const t2 = await testReanalyze();

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`  Test 1 (analyze):    ${t1 ? 'PASSED' : 'FAILED'}`);
  console.log(`  Test 2 (reanalyze):  ${t2 ? 'PASSED' : 'FAILED'}`);
  console.log(`  Overall:             ${t1 && t2 ? 'ALL PASSED' : 'SOME FAILED'}`);

  // Exit with code for CI
  process.exit(t1 && t2 ? 0 : 1);
}

main();
