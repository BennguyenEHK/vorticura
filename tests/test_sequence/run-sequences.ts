/**
 * =============================================
 * DATABASE HANDLER — Integration Test Sequence
 * =============================================
 * Feeds real JSON inputs through modifyDatabase() for every
 * data_type + action_type combination, printing status after each run.
 *
 * Run:  npx tsx --env-file=.env.local tests/test_sequence/run-sequences.ts
 *
 * Workspace: client_id=1, company_id=1 (auto-injected by queries.ts)
 * Database:  Real Neon DB via DATABASE_URL env var
 *
 * Prerequisites: Inserts a client_company row (company_id=1) if missing.
 * All subsequent tests use real FK relationships.
 */

// NOTE: Run with --env-file to load env vars BEFORE module resolution:
//   npx tsx --env-file=.env.local tests/test_sequence/run-sequences.ts

import { modifyDatabase, type ModifyDatabaseInput } from '@/lib/utils/databaseHandler';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import { getData, insertData } from '@/lib/db/queries';
import { pool } from '@/lib/db/client';

// =============================================
// WORKSPACE SETUP — client_id=1, company_id=1
// =============================================

const workspace = new WorkspaceContext({
  client_id: 1,
  company_id: 1,
  username: 'test-runner',
  role: 'admin',
});

// =============================================
// ANSI COLORS
// =============================================

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// =============================================
// TYPES
// =============================================

interface TestCase {
  label: string;
  data_type: string;
  action_type: string;
  buildInput: (ctx: RunContext) => ModifyDatabaseInput; // dynamic builder to inject IDs
}

/** Runtime context — IDs captured from earlier test INSERTs */
interface RunContext {
  rfqId?: number;
  searchId?: number;
  quotationId?: number;
}

// =============================================
// TEST CASE DEFINITIONS
// =============================================
// Each case builds its input dynamically using RunContext
// so FK IDs from earlier tests can be injected.

const TEST_CASES: TestCase[] = [
  // --------------------------------------------------
  // 1. rfq_analysis:analyze — INSERT new analysis
  // --------------------------------------------------
  {
    label: 'Insert new RFQ analysis',
    data_type: 'rfq_analysis',
    action_type: 'analyze',
    buildInput: () => ({
      data_type: 'rfq_analysis',
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      rfq_analysis: {
        subject: 'RFQ Analysis - HVAC Equipment for Marina Boulevard Project',
        analysis_content:
          'Client Pacific Climate Solutions requests quotation for 3 categories of HVAC equipment. ' +
          'Key requirements: energy efficiency, Singapore-compliant refrigerants, BACnet integration.',
        analysis_status: 'completed',
      },
    }),
  },

  // --------------------------------------------------
  // 2. supplier_search:search — INSERT new search (needs rfq_id)
  // --------------------------------------------------
  {
    label: 'Insert new supplier search',
    data_type: 'supplier_search',
    action_type: 'search',
    buildInput: (ctx) => ({
      data_type: 'supplier_search',
      rfq_id: ctx.rfqId,
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      suppliers_search: {
        subject: 'Supplier Search Results - HVAC Equipment',
        search_content:
          'Identified 5 potential suppliers across 3 equipment categories. ' +
          'Daikin and Carrier lead on chillers; Trane for AHU; Mitsubishi for VRF.',
        search_status: 'completed',
      },
    }),
  },

  // --------------------------------------------------
  // 3. email:generate — INSERT draft supplier inquiry email (needs rfq_id)
  // --------------------------------------------------
  {
    label: 'Insert draft supplier inquiry email',
    data_type: 'email',
    action_type: 'generate',
    buildInput: (ctx) => ({
      data_type: 'email',
      rfq_id: ctx.rfqId,
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      email: {
        rfq_id: ctx.rfqId,   // email_table CHECK: rfq_id IS NOT NULL OR quotation_id IS NOT NULL
        subject: 'Request for Quotation - HVAC Equipment (RFQ-TEST-2026-HVAC)',
        email_content:
          'Dear Sir/Madam,\n\nWe are requesting a formal quotation for the following HVAC equipment:\n' +
          '1) Industrial Chiller Unit 50-Ton x 2 SETS\n' +
          '2) AHU 15000CFM with Heat Recovery x 1 SET\n' +
          '3) VRF Outdoor Unit 24HP x 5 EA\n\nPlease reply within 7 business days.',
        recipient_email: 'quotations@daikin.com.sg',
        email_status: 'draft',
      },
    }),
  },

  // --------------------------------------------------
  // 4. quotation:generate — INSERT shell + customer + items (needs rfq_id)
  // --------------------------------------------------
  {
    label: 'Insert quotation shell with customer + 3 items',
    data_type: 'quotation',
    action_type: 'generate',
    buildInput: (ctx) => ({
      data_type: 'quotation',
      quotationData: {
        rfq_id: ctx.rfqId,
        rfq_reference: 'RFQ-TEST-2026-HVAC',
        quotation_name: 'Quotation - HVAC Equipment for Marina Boulevard Project',
        quotation_status: 'draft',
        commercial_terms:
          '1. All prices in USD, exclude taxes\n2. Delivery: DAP Singapore\n' +
          '3. Payment: 30% advance, 60% delivery, 10% commissioning\n4. Validity: 60 days',
        transfer_currency_code: 'USD',
        generated_day: '2026-03-31',
        customer_info: {
          company_name: 'Pacific Climate Solutions Ltd.',
          attention_person: 'Mr. James Rodriguez',
          carbon_copy_person: ['Ms. Lisa Park', 'Mr. Robert Thompson'],
          email: 'james.rodriguez@pacificclimate.com',
          phone: '+65 6789 1234',
          fax_number: '+65 6789 1240',
          customer_address: '88 Marina Boulevard, #12-05, Singapore 018956',
        },
        quotation_items: [
          {
            item_id: 1,
            currency_code: 'USD',
            company_requirement: {
              company_description: 'Industrial Chiller Unit, 50-Ton Capacity (Model ICU-50T)',
              qty: 2,
              uom: 'SET',
            },
            bidder_proposal: {
              bidder_description: 'Premium 50-Ton Industrial Chiller (ICU-50T), R-410A refrigerant',
              bidder_unit_price: 7500,
              delivery_time: '8 weeks ARO',
              compliance_deviation: 'Meets all specs with enhanced efficiency',
            },
          },
          {
            item_id: 2,
            currency_code: 'USD',
            company_requirement: {
              company_description: 'Air Handling Unit with Heat Recovery, 15000 CFM (Model AHU-15K-HR)',
              qty: 1,
              uom: 'SET',
            },
            bidder_proposal: {
              bidder_description: 'Energy-efficient AHU with heat recovery wheel, VFD, MERV 14',
              bidder_unit_price: 11500,
              delivery_time: '10 weeks ARO',
              compliance_deviation: 'Fully compliant. Includes vibration isolation mounts.',
            },
          },
          {
            item_id: 3,
            currency_code: 'USD',
            company_requirement: {
              company_description: 'VRF Outdoor Unit, 24HP (Model VRF-24HP)',
              qty: 5,
              uom: 'EA',
            },
            bidder_proposal: {
              bidder_description: 'Advanced VRF outdoor unit, inverter technology, BACnet protocol',
              bidder_unit_price: 5900,
              delivery_time: '6 weeks ARO',
              compliance_deviation: 'Exceeds efficiency by 15%. 3-year warranty.',
            },
          },
        ],
      },
    }),
  },

  // --------------------------------------------------
  // 5. quotation:manual_update — UPDATE partial fields (needs quotation_id + rfq_id)
  // --------------------------------------------------
  {
    label: 'Partial update: customer address + commercial terms + item qty',
    data_type: 'quotation',
    action_type: 'manual_update',
    buildInput: (ctx) => ({
      data_type: 'quotation',
      quotationData: {
        quotation_id: ctx.quotationId,
        rfq_id: ctx.rfqId,
        quotation_status: 'manually_updated',
        commercial_terms: '1. All prices in USD, exclude taxes\n2. Delivery: CIF Singapore\n3. Payment: NET 30\n4. Validity: 45 days',
        customer_info: {
          customer_address: '99 Robinson Road, #15-01, Singapore 068899',
        },
        quotation_items: [
          {
            item_id: 1,
            company_requirement: { qty: 3 }, // changed from 2 to 3
          },
        ],
      },
    }),
  },

  // --------------------------------------------------
  // 6. quotation:calculate — INSERT pricing + update total (needs quotation_id)
  // --------------------------------------------------
  {
    label: 'Calculate pricing for all 3 items',
    data_type: 'quotation',
    action_type: 'calculate',
    buildInput: (ctx) => ({
      data_type: 'quotation',
      exchange_currency: 'USD',
      quotationData: {
        quotation_id: ctx.quotationId,
        quotation_status: 'priced',
      },
      pricing_variables: [
        { item_id: 1, shipping_cost: 500, exchange_rate: 1.0, tax_rate: 1.08, profit_rate: 1.25, discount_rate: 0.05 },
        { item_id: 2, shipping_cost: 800, exchange_rate: 1.0, tax_rate: 1.08, profit_rate: 1.20, discount_rate: 0 },
        { item_id: 3, shipping_cost: 200, exchange_rate: 1.0, tax_rate: 1.08, profit_rate: 1.30, discount_rate: 0.03 },
      ],
      calculatedPricing: {
        calculated_pricing: [
          { item_id: 1, sales_unit_price: 10260.00, ext_price: 30780.00, potential_profit: 4520.00 },
          { item_id: 2, sales_unit_price: 15940.80, ext_price: 15940.80, potential_profit: 3640.80 },
          { item_id: 3, sales_unit_price: 8121.46,  ext_price: 40607.28, potential_profit: 7607.28 },
        ],
        total_amount: 87328.08,
      },
    }),
  },

  // --------------------------------------------------
  // 7. email:generate — INSERT quotation email (needs quotation_id)
  // --------------------------------------------------
  {
    label: 'Insert quotation email draft to customer',
    data_type: 'email',
    action_type: 'generate',
    buildInput: (ctx) => ({
      data_type: 'email',
      quotation_id: ctx.quotationId,
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      email: {
        quotation_id: ctx.quotationId, // satisfies CHECK constraint
        subject: 'Quotation - HVAC Equipment for Marina Boulevard Project',
        email_content:
          'Dear Mr. Rodriguez,\n\nPlease find attached our quotation for the HVAC equipment ' +
          'as per your RFQ-TEST-2026-HVAC.\n\nTotal Amount: USD 87,328.08\nValidity: 45 days\n\nBest regards,\nSales Team',
        recipient_email: 'james.rodriguez@pacificclimate.com',
        email_status: 'draft',
      },
    }),
  },

  // --------------------------------------------------
  // 8. incoming_email:handleRFQ — INSERT raw incoming email
  // --------------------------------------------------
  {
    label: 'Insert raw incoming email (RFQ classification)',
    data_type: 'incoming_email',
    action_type: 'handleRFQ',
    buildInput: () => ({
      data_type: 'incoming_email',
      incoming_email: {
        message_id: '<test-msg-001@pacificclimate.com>',
        from_email: 'james.rodriguez@pacificclimate.com',
        from_name: 'James Rodriguez',
        to: ['sales@ourcompany.com'],
        cc: ['lisa.park@pacificclimate.com'],
        subject: 'RFQ - HVAC Equipment for Marina Boulevard Project',
        email_body_text:
          'Dear Sir/Madam,\n\nWe would like to request a quotation for HVAC equipment ' +
          'for our Marina Boulevard project. Please see attached specifications.',
        attachments_parsed: [
          {
            filename: 'RFQ-HVAC-2026.pdf',
            content_type: 'application/pdf',
            extracted_text: 'ITEM 1: Industrial Chiller Unit, 50-Ton, Qty: 2 SETS...',
          },
        ],
        classification_type: 'rfq_analysis',
        classification_confidence: '0.950',
        received_at: '2026-03-31T10:00:00Z',
        processed_at: '2026-03-31T10:01:00Z',
      },
    }),
  },

  // --------------------------------------------------
  // 9. rfq_analysis:reanalyze — UPDATE existing analysis (needs rfq_id)
  // --------------------------------------------------
  {
    label: 'Update existing RFQ analysis (reanalyze path)',
    data_type: 'rfq_analysis',
    action_type: 'reanalyze',
    buildInput: (ctx) => ({
      data_type: 'rfq_analysis',
      rfq_id: ctx.rfqId,
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      rfq_analysis: {
        subject: 'RFQ Analysis (Revised) - HVAC Equipment for Marina Boulevard Project',
        analysis_content:
          'REVISED: Client requests 3 HVAC categories. Updated: Chiller capacity corrected to 60-Ton. ' +
          'Voltage clarification needed (380V vs 415V). Delivery deadline: 14 business days.',
        analysis_status: 'completed',
      },
    }),
  },

  // --------------------------------------------------
  // 10. supplier_search:research — UPDATE existing search (needs search_id + rfq_id)
  // --------------------------------------------------
  {
    label: 'Update existing supplier search (research path)',
    data_type: 'supplier_search',
    action_type: 'research',
    buildInput: (ctx) => ({
      data_type: 'supplier_search',
      search_id: ctx.searchId,
      rfq_id: ctx.rfqId,
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      suppliers_search: {
        subject: 'Supplier Search (Revised) - HVAC Equipment',
        search_content:
          'REVISED: Added Johnson Controls and York as alternatives. Removed Carrier (long lead times). ' +
          'Now 7 suppliers across 3 categories with minimum 2 per item.',
        search_status: 'completed',
      },
    }),
  },
];

// =============================================
// SETUP: Ensure client_company exists
// =============================================

/**
 * Insert client_company row (company_id=1) if it doesn't exist.
 * This is the FK parent for all tenant tables.
 */
async function ensureClientCompany(): Promise<void> {
  const existing = await getData('clientCompany', { companyId: 1 }, workspace);
  if (existing.length > 0) {
    console.log(`${DIM}  [setup] client_company (id=1) already exists${RESET}`);
    return;
  }

  // Insert a minimal client_company row
  await insertData('clientCompany', {}, {
    companyName: 'Test Engineering Pte Ltd.',
    companyNumber: 'REG-TEST-001',
    companyAddress: '100 Cecil Street, #10-01, Singapore 049710',
    companyEmail: 'sales@testengineering.com',
  }, workspace);
  console.log(`${GREEN}  [setup] client_company (id=1) inserted${RESET}`);
}

// =============================================
// TEST RUNNER
// =============================================

function padLabel(dataType: string, actionType: string): string {
  return `${dataType}:${actionType}`.padEnd(30, ' ');
}

async function runTests(): Promise<void> {
  const total = TEST_CASES.length;
  let passed = 0;
  let failed = 0;

  // Runtime context — accumulates IDs from earlier INSERTs
  const ctx: RunContext = {};

  console.log(`\n${BOLD}========================================${RESET}`);
  console.log(`${BOLD} DATABASE HANDLER — Integration Test${RESET}`);
  console.log(`${BOLD}========================================${RESET}`);
  console.log(`${DIM}Workspace: company_id=1, client_id=1${RESET}`);
  console.log(`${DIM}Test cases: ${total}${RESET}\n`);

  // SETUP: ensure FK parent exists
  try {
    await ensureClientCompany();
  } catch (err) {
    console.error(`${RED}SETUP FAILED: ${err}${RESET}`);
    await pool.end();
    process.exit(1);
  }

  console.log(''); // blank line before tests

  for (let i = 0; i < total; i++) {
    const tc = TEST_CASES[i];
    const num = `[${i + 1}/${total}]`;
    const tag = padLabel(tc.data_type, tc.action_type);
    const start = Date.now();

    try {
      // Build input with current context (injects rfq_id, quotation_id, etc.)
      const input = tc.buildInput(ctx);

      // Execute modifyDatabase
      await modifyDatabase(input, workspace);
      const elapsed = Date.now() - start;

      // --- Capture auto-generated IDs for later tests ---

      // After test 1: capture rfq_id from inserted rfq_analysis
      if (i === 0) {
        const rows = await getData('rfqAnalysis', { rfqReference: 'RFQ-TEST-2026-HVAC' }, workspace);
        if (rows.length > 0) {
          ctx.rfqId = (rows[0] as Record<string, unknown>).rfqId as number;
          console.log(`  ${DIM}     -> captured rfq_id = ${ctx.rfqId}${RESET}`);
        }
      }

      // After test 2: capture search_id from inserted supplier_search
      if (i === 1) {
        const rows = await getData('supplierSearch', { rfqReference: 'RFQ-TEST-2026-HVAC' }, workspace);
        if (rows.length > 0) {
          ctx.searchId = (rows[0] as Record<string, unknown>).searchId as number;
          console.log(`  ${DIM}     -> captured search_id = ${ctx.searchId}${RESET}`);
        }
      }

      // After test 4: capture quotation_id from inserted quotation
      if (i === 3) {
        const rows = await getData('quotations', { rfqReference: 'RFQ-TEST-2026-HVAC' }, workspace);
        if (rows.length > 0) {
          ctx.quotationId = (rows[0] as Record<string, unknown>).quotationId as number;
          console.log(`  ${DIM}     -> captured quotation_id = ${ctx.quotationId}${RESET}`);
        }
      }

      // Print PASS
      console.log(`  ${GREEN}PASS${RESET} ${num} ${CYAN}${tag}${RESET} ${DIM}${tc.label} (${elapsed}ms)${RESET}`);
      passed++;
    } catch (error) {
      const elapsed = Date.now() - start;
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ${RED}FAIL${RESET} ${num} ${CYAN}${tag}${RESET} ${DIM}${tc.label} (${elapsed}ms)${RESET}`);
      console.log(`       ${RED}Error: ${msg}${RESET}`);
      failed++;
    }
  }

  // Summary
  console.log(`\n${BOLD}========================================${RESET}`);
  console.log(`${BOLD} Results: ${GREEN}${passed} passed${RESET}${failed > 0 ? `, ${RED}${failed} failed${RESET}` : ''}${BOLD} / ${total} total${RESET}`);
  console.log(`${BOLD}========================================${RESET}\n`);

  // Close DB pool
  await pool.end();

  if (failed > 0) process.exit(1);
}

// =============================================
// ENTRY POINT
// =============================================

runTests().catch((err) => {
  console.error(`\n${RED}Fatal error:${RESET}`, err);
  pool.end().finally(() => process.exit(1));
});
