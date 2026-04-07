/**
 * =============================================
 * DATABASE HANDLER — Integration Test Sequence
 * =============================================
 * Feeds real JSON inputs through modifyDatabase() for every
 * data_type combination, printing status after each run.
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
  user_id: 1,       // renamed from client_id
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
  action_label: string;  // display label only (not sent to modifyDatabase)
  buildInput: (ctx: RunContext) => ModifyDatabaseInput;
}

/** Runtime context — IDs captured from earlier test INSERTs */
interface RunContext {
  rfqId?: number;
  searchId?: number;
  quotationId?: number;
  emailId?: number;
  incomingEmailId?: number;
}

// =============================================
// TEST CASE DEFINITIONS
// =============================================
// Each case builds its input dynamically using RunContext
// so FK IDs from earlier tests can be injected.
// WRITE_MAP routes by data_type only; extract() self-gates on input field presence.

const TEST_CASES: TestCase[] = [

  // ─── 1. rfq_analysis — INSERT (single table: rfqAnalysis) ───
  {
    label: 'Insert new RFQ analysis (rfqAnalysis only)',
    data_type: 'rfq_analysis',
    action_label: 'analyze',
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

  // ─── 2. rfq_analysis — INSERT multi-table (rfqAnalysis + rfqItems) ───
  {
    label: 'Update analysis + insert rfq_items (multi-table)',
    data_type: 'rfq_analysis',
    action_label: 'reanalyze+items',
    buildInput: (ctx) => ({
      data_type: 'rfq_analysis',
      rfq_id: ctx.rfqId,
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      rfq_analysis: {
        subject: 'RFQ Analysis (Revised) - HVAC Equipment',
        analysis_content:
          'REVISED: Chiller capacity corrected to 60-Ton. Voltage clarification needed (380V vs 415V).',
        analysis_status: 'completed',
      },
      rfq_items: [
        {
          item_id: 1,
          currency_code: 'USD',
          company_requirement: {
            company_description: 'Industrial Chiller Unit, 60-Ton Capacity (Model ICU-60T)',
            qty: 2,
            uom: 'SET',
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
        },
        {
          item_id: 3,
          currency_code: 'USD',
          company_requirement: {
            company_description: 'VRF Outdoor Unit, 24HP (Model VRF-24HP)',
            qty: 5,
            uom: 'EA',
          },
        },
      ],
    }),
  },

  // ─── 3. supplier_search — INSERT (single table: supplierSearch) ───
  {
    label: 'Insert new supplier search (supplierSearch only)',
    data_type: 'supplier_search',
    action_label: 'search',
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

  // ─── 4. supplier_search — INSERT multi-table (supplierSearch + supplierItemStatus) ───
  {
    label: 'Update search + insert supplier items (multi-table)',
    data_type: 'supplier_search',
    action_label: 'research+items',
    buildInput: (ctx) => ({
      data_type: 'supplier_search',
      search_id: ctx.searchId,
      rfq_id: ctx.rfqId,
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      suppliers_search: {
        subject: 'Supplier Search (Revised) - HVAC Equipment',
        search_content:
          'REVISED: Added Johnson Controls and York. 7 suppliers across 3 categories.',
        search_status: 'completed',
      },
      items_source: [
        {
          item_id: 1,
          supplier_id: 1,
          supplier_name: 'Daikin Industries Ltd.',
          source_url: 'https://www.daikin.com.sg/products/chillers/icu-50t',
          status: 'pending',
          delivery_time: '8-10 weeks',
          bidder_description: 'Advanced chiller with inverter technology',
          bidder_unit_price: 6200,
          compliance_deviation: 'Exceeds efficiency by 15%',
          notes: 'Authorized distributor in Singapore',
        },
        {
          item_id: 1,
          supplier_id: 2,
          supplier_name: 'Carrier Global Corp.',
          source_url: 'https://www.carrier.com/commercial/en/sg/products/chillers',
          status: 'pending',
          delivery_time: '10-12 weeks',
          bidder_description: 'Water-cooled chiller with scroll compressors',
          bidder_unit_price: 8200,
          compliance_deviation: 'Meets baseline standards',
          notes: 'Direct OEM supply',
        },
        {
          item_id: 2,
          supplier_id: 3,
          supplier_name: 'Trane Technologies',
          source_url: 'https://www.trane.com/commercial/asia/sg/en/products/air-handlers.html',
          status: 'pending',
          delivery_time: '8-12 weeks',
          bidder_description: 'Modular AHU with heat recovery and MERV 14',
          bidder_unit_price: 11500,
          compliance_deviation: 'Surpasses air filtration standards',
          notes: 'Requires on-site commissioning',
        },
        {
          item_id: 3,
          supplier_id: 1,
          supplier_name: 'Daikin Industries Ltd.',
          source_url: 'https://www.daikin.com.sg/products/vrf/vrv-outdoor',
          status: 'pending',
          delivery_time: '6-8 weeks',
          bidder_description: 'VRV outdoor unit with variable refrigerant flow',
          bidder_unit_price: 5800,
          compliance_deviation: 'Exceeds benchmarks by 10%',
          notes: 'Compact design, BACnet ready',
        },
        {
          item_id: 3,
          supplier_id: 4,
          supplier_name: 'Mitsubishi Electric Asia',
          source_url: 'https://www.mitsubishielectric.com.sg/products/air-conditioning/vrf',
          status: 'pending',
          delivery_time: '6-10 weeks',
          bidder_description: 'City Multi VRF with zoning and monitoring',
          bidder_unit_price: 6100,
          compliance_deviation: 'Includes smart diagnostics',
          notes: 'Remote monitoring supported',
        },
      ],
    }),
  },

  // ─── 5. email — INSERT draft supplier inquiry ───
  {
    label: 'Insert draft supplier inquiry email',
    data_type: 'email',
    action_label: 'generate',
    buildInput: (ctx) => ({
      data_type: 'email',
      rfq_id: ctx.rfqId,
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      email: {
        rfq_id: ctx.rfqId,
        subject: 'Request for Quotation - HVAC Equipment (RFQ-TEST-2026-HVAC)',
        email_content:
          'Dear Sir/Madam,\n\nWe are requesting a formal quotation for the following HVAC equipment:\n' +
          '1) Industrial Chiller Unit 60-Ton x 2 SETS\n' +
          '2) AHU 15000CFM with Heat Recovery x 1 SET\n' +
          '3) VRF Outdoor Unit 24HP x 5 EA\n\nPlease reply within 7 business days.',
        recipient_email: 'quotations@daikin.com.sg',
        email_status: 'draft',
      },
    }),
  },

  // ─── 6. incoming_email — INSERT raw incoming email ───
  {
    label: 'Insert raw incoming email (RFQ classification)',
    data_type: 'incoming_email',
    action_label: 'classify',
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

  // ─── 7. quotation — INSERT (quotations + customers + rfqItems + supplierItemStatus) ───
  {
    label: 'Insert quotation with customer + items + bidder proposals',
    data_type: 'quotation',
    action_label: 'generate',
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
        seller_info: {
          company_name: 'Test Engineering Pte Ltd.',
          address: '100 Cecil Street, #10-01, Singapore 049710',
          fax_number: '+65 6100 9999',
          email: 'sales@testengineering.com',
        },
        quotation_items: [
          {
            item_id: 1,
            supplier_id: 1,
            currency_code: 'USD',
            company_requirement: {
              company_description: 'Industrial Chiller Unit, 60-Ton Capacity (Model ICU-60T)',
              qty: 2,
              uom: 'SET',
            },
            bidder_proposal: {
              bidder_description: 'Premium 60-Ton Industrial Chiller (ICU-60T), R-410A refrigerant',
              bidder_unit_price: 7500,
              delivery_time: '8 weeks ARO',
              compliance_deviation: 'Meets all specs with enhanced efficiency',
            },
          },
          {
            item_id: 2,
            supplier_id: 3,
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
            supplier_id: 1,
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

  // ─── 8. quotation — UPDATE partial (manual_update path) ───
  {
    label: 'Partial update: customer address + commercial terms + item qty',
    data_type: 'quotation',
    action_label: 'manual_update',
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
            company_requirement: { qty: 3 },
          },
        ],
      },
    }),
  },

  // ─── 9. quotation — CALCULATE pricing (quotationPricing + total_amount) ───
  {
    label: 'Calculate pricing for all 3 items + update total',
    data_type: 'quotation',
    action_label: 'calculate',
    buildInput: (ctx) => ({
      data_type: 'quotation',
      exchange_currency: 'USD',
      quotationData: {
        quotation_id: ctx.quotationId,
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

  // ─── 10. email — INSERT quotation email (needs quotation_id) ───
  {
    label: 'Insert quotation email draft to customer',
    data_type: 'email',
    action_label: 'generate',
    buildInput: (ctx) => ({
      data_type: 'email',
      quotation_id: ctx.quotationId,
      rfq_reference: 'RFQ-TEST-2026-HVAC',
      email: {
        quotation_id: ctx.quotationId,
        subject: 'Quotation - HVAC Equipment for Marina Boulevard Project',
        email_content:
          'Dear Mr. Rodriguez,\n\nPlease find attached our quotation for the HVAC equipment ' +
          'as per your RFQ-TEST-2026-HVAC.\n\nTotal Amount: USD 87,328.08\nValidity: 45 days\n\nBest regards,\nSales Team',
        recipient_email: 'james.rodriguez@pacificclimate.com',
        email_status: 'draft',
      },
    }),
  },
];

// =============================================
// SETUP: Ensure client_company exists
// =============================================

async function ensureUserCompany(): Promise<void> {
  const existing = await getData('userCompany', { companyId: 1 }, workspace);
  if (existing.length > 0) {
    console.log(`${DIM}  [setup] user_company (id=1) already exists${RESET}`);
    return;
  }

  await insertData('userCompany', {}, {
    companyName: 'Test Engineering Pte Ltd.',
    companyNumber: 'REG-TEST-001',
    companyAddress: '100 Cecil Street, #10-01, Singapore 049710',
    companyEmail: 'sales@testengineering.com',
  }, workspace);
  console.log(`${GREEN}  [setup] user_company (id=1) inserted${RESET}`);
}

// =============================================
// TEST RUNNER
// =============================================

function padLabel(dataType: string, actionLabel: string): string {
  return `${dataType}:${actionLabel}`.padEnd(32, ' ');
}

async function runTests(): Promise<void> {
  const total = TEST_CASES.length;
  let passed = 0;
  let failed = 0;

  const ctx: RunContext = {};

  console.log(`\n${BOLD}========================================${RESET}`);
  console.log(`${BOLD} DATABASE HANDLER — Integration Test${RESET}`);
  console.log(`${BOLD} WRITE_MAP unified pattern${RESET}`);
  console.log(`${BOLD}========================================${RESET}`);
  console.log(`${DIM}Workspace: company_id=1, user_id=1${RESET}`);
  console.log(`${DIM}Test cases: ${total}${RESET}\n`);

  try {
    await ensureUserCompany();
  } catch (err) {
    console.error(`${RED}SETUP FAILED: ${err}${RESET}`);
    await pool.end();
    process.exit(1);
  }

  console.log('');

  for (let i = 0; i < total; i++) {
    const tc = TEST_CASES[i];
    const num = `[${i + 1}/${total}]`;
    const tag = padLabel(tc.data_type, tc.action_label);
    const start = Date.now();

    try {
      const input = tc.buildInput(ctx);
      await modifyDatabase(input, workspace);
      const elapsed = Date.now() - start;

      // --- Capture auto-generated IDs for subsequent tests ---

      // After test 1: capture rfq_id from rfq_analysis
      if (i === 0) {
        const rows = await getData('rfqAnalysis', { rfqReference: 'RFQ-TEST-2026-HVAC' }, workspace);
        if (rows.length > 0) {
          ctx.rfqId = (rows[0] as Record<string, unknown>).rfqId as number;
          console.log(`  ${DIM}     -> captured rfq_id = ${ctx.rfqId}${RESET}`);
        }
      }

      // After test 3: capture search_id from supplier_search
      if (i === 2) {
        const rows = await getData('supplierSearch', { rfqReference: 'RFQ-TEST-2026-HVAC' }, workspace);
        if (rows.length > 0) {
          ctx.searchId = (rows[0] as Record<string, unknown>).searchId as number;
          console.log(`  ${DIM}     -> captured search_id = ${ctx.searchId}${RESET}`);
        }
      }

      // After test 7: capture quotation_id from quotations
      if (i === 6) {
        const rows = await getData('quotations', { rfqReference: 'RFQ-TEST-2026-HVAC' }, workspace);
        if (rows.length > 0) {
          ctx.quotationId = (rows[0] as Record<string, unknown>).quotationId as number;
          console.log(`  ${DIM}     -> captured quotation_id = ${ctx.quotationId}${RESET}`);
        }
      }

      console.log(`  ${GREEN}PASS${RESET} ${num} ${CYAN}${tag}${RESET} ${DIM}${tc.label} (${elapsed}ms)${RESET}`);
      passed++;
    } catch (error) {
      const elapsed = Date.now() - start;
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ${RED}FAIL${RESET} ${num} ${CYAN}${tag}${RESET} ${DIM}${tc.label} (${elapsed}ms)${RESET}`);
      console.log(`       ${RED}Error: ${msg}${RESET}`);
      if (error instanceof Error && error.stack) {
        console.log(`       ${DIM}${error.stack.split('\n').slice(1, 3).join('\n       ')}${RESET}`);
      }
      failed++;
    }
  }

  // Summary
  console.log(`\n${BOLD}========================================${RESET}`);
  console.log(`${BOLD} Results: ${GREEN}${passed} passed${RESET}${failed > 0 ? `, ${RED}${failed} failed${RESET}` : ''}${BOLD} / ${total} total${RESET}`);
  if (failed === 0) {
    console.log(`${GREEN}${BOLD} All data_types verified:${RESET}`);
    console.log(`${DIM}   rfq_analysis    → rfqAnalysis + rfqItems${RESET}`);
    console.log(`${DIM}   supplier_search → supplierSearch + supplierItemStatus${RESET}`);
    console.log(`${DIM}   email           → emailTable${RESET}`);
    console.log(`${DIM}   incoming_email  → incomingEmails${RESET}`);
    console.log(`${DIM}   quotation       → quotations + customers + userCompany + rfqItems + supplierItemStatus + quotationPricing${RESET}`);
  }
  console.log(`${BOLD}========================================${RESET}\n`);

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
