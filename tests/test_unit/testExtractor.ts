import assert from 'assert';
import { mkdirSync, writeFileSync } from 'fs';
import { extractAll, type IncomingEmailFields } from '@/lib/utils/rfq-extractor';

// Reconstructed SEQ_1_1 incoming_email (taken from tests/test_sequence/test-analyze-rfq.ts)
const email: IncomingEmailFields = {
  from_email: 'hoanghuyco.sales@gmail.com',
  from_name: 'Hoang Huy Co., Ltd',
  cc: [],
  subject: 'Hoang Huy] -RFQ for Provision of Materials for Valves of Air Dryer, PR 25-10337',
  email_body_text: `Dear Mr.Huy

We would invite your company to submit proposal for provision of goods and/or services to support our petroleum operation in the Block 15-2, Vung Tau, Vietnam as hereunder.

We would request that your proposal submitted must be strictly in compliance with this request for quotation and its applicable documents hereunder. The proposal should be in Vietnam currency, and valid for a period of no lesser than forty-five (45) days, unless otherwise quoted. By submission of proposal, your company is deemed to accept those aforesaid requirements of the Company.

Description and requirement: as per Attachment 1 hereunder.
Tender's Closing Time:
12:00 hours on 19-Jun-25.
Contract terms and condition: our standardized contract terms and condition is applied.

Proposal shall be submitted as below selected requirement, which is marked with :
Option a: in sealed envelopes with two separate packages for technical and commercial proposal.
Option b: via email by two separate emails i.e. one email for technical proposal, and other email for commercial proposal.
Password protection: the password protection for commercial proposal of Option b, if it is so required, shall be sent by another separate email to the under-signed and members in the Copy list as first mentioned above.
Kindly acknowledge receipt of this request and confirm your intention to submit proposal as soon as possible but not later than 12:00 hours on 7-Jun-25.

No | Maximo # | Description of Goods/Services <More details as per Attachment 2> | QTY (EA)
1 | 217382 | Check valve, swing, 2", 150#, RF (JVPC Spec A5R), CAPS order #155107, Crane 147XU 50NB Swing Check Valve. Tag: ACV1, ACV2 in drawing CCP-2898 for NULQ-SK-6111A/B | 4
2 | 217376 | Valve, with Bettis CB415 actuator on Crane KF941, 2", 150#, RF, for NULQ-SK-6111A/B | 4
3 | 204985 | Valve, Ball, 2", 150#, RF, Carbon Steel, Full Bore, ANSI B16-34, TVC KF941 | 4
4 | 217377 | Repair kit for Bettis CB415 actuator, for NULQ-SK-6111A/B | 6
5 | 217378 | Auto Drain Valve, CAPS order number 156091, for NULQ-SK6111A/B | 2
6 | 217375 | Valve, ball, 1-1/2inch,FB, 150#, RF, FV-1B, Outlet tower Left/Right, for NULQ- SK-6111C | 1
7 | 217379 | Pressure safety Valve, Hydroseal Model: 4FRVOL, 1" inlet/outlet, for NULQ-SK-6111C | 2
8 | 215840 | Repair Kit for Metal Diaphragm Valve size 1-1/2", Ingersoll Rand, P/N: 630392, Tower inlet valve (FV-1A), for Air Dryer | 1
9 |  | Deliverables: CO, CQ, cert of compliance and other applicable certs by MFR | 1

Thank you and Kind regards,

Nguyen Ai Thanh Dan (Ms.)
Supply Chain Group

Japan Vietnam Petroleum Company
A Subsidiary of ENEOS Xplora
7th Fl, PetroVietnam Tower, 08 Hoang Dieu, W.1, Vung Tau City, S.R.Vietnam
T 84-254-3856937, Ext. 366      HP 84-903007794
`,
  attachments_parsed: [
    {
      filename: 'RFQ to HHUY_25-201.pdf',
      content_type: 'application/pdf',
      extracted_text: `Inquiry No.:\nDate:\n\nJVPC-PRC-25-Q-201\n6-Jun-25\n\nRequisition ("PR") No.: PRD-25-PR-10337\nPR Approved (internal): 26-May-25\n\nTo:\n\nHoang Huy Trading & Services Co., Ltd\n\nFax No.: 0254 3572799\n\nAttn:\n\nMr. Nguyen Quang Huy, Director\n\nC.c:\n\nMr. Tran Ngoc Tuan, Group Manager, Suply Chain Group, JVPC\nMr. Do Van Dinh, Procurement Team Leader, JVPC\n\nPage(s): 5 pages (incl. this page)\nSubject:\n\nRequest for Quotation for Provision of Material for defectives Valves of Air Dryer\n\nDear Mr. Huy,\nWe would invite your company to submit proposal for provision of goods and/or services to support our petroleum operation in the Block 15-2, Vung Tau, Vietnam as hereunder.\nWe would request that your proposal submitted must be strictly in compliance with this request for quotation and its applicable documents hereunder. The proposal should be in Vietnam currency, and valid for a period of no lesser than forty-five (45) days, unless otherwise quoted. By submission of proposal, your company is deemed to accept those aforesaid requirements of the Company.\nDescription and requirement: as per Attachment 1 hereunder.\nTender's Closing Time:\n12:00 hours on 19-Jun-25.\n...`,
    },
    {
      filename: 'RFQ_25-201_Att-2.pdf',
      content_type: 'application/pdf',
      extracted_text: '[PDF – 1.08 MB. Not auto-extracted by Gmail Pub/Sub watcher. Expected: Attachment 2 detailed technical datasheets and specifications for all 8 valve line items including drawings, standards, and MFR certs requirements.]',
    },
  ],
};

async function run() {
  const extracted = extractAll(email);

  try {
    assert.strictEqual(extracted.rfq_reference, 'RFQ PR-25-10337');
    assert.strictEqual(extracted.customer.email, 'hoanghuyco.sales@gmail.com');
    assert.strictEqual(extracted.required_currency, 'VND');
    assert.ok(Array.isArray(extracted.rfq_items), 'rfq_items must be an array');
    assert.strictEqual(extracted.rfq_items.length, 9, `expected 9 items, got ${extracted.rfq_items.length}`);
    assert.ok(extracted.deadline_period && extracted.deadline_period.includes('45'), 'deadline_period should include "45"');
    assert.ok(extracted.closing_time && !isNaN(Date.parse(extracted.closing_time)), 'closing_time must be a valid ISO date');

    console.log('\n[TEST] extractAll() ✅ — All assertions passed');
    console.log('[RESULT SUMMARY]');
    console.log(`  rfq_reference: ${extracted.rfq_reference}`);
    console.log(`  customer.email: ${extracted.customer.email}`);
    console.log(`  required_currency: ${extracted.required_currency}`);
    console.log(`  rfq_items.length: ${extracted.rfq_items.length}`);
    console.log(`  deadline_period: ${extracted.deadline_period}`);
    console.log(`  closing_time: ${extracted.closing_time}`);

    // Print full extracted items
    console.log('\n[EXTRACTED ITEMS]');
    console.log(JSON.stringify(extracted.rfq_items, null, 2));

    // Persist the extracted items to a JSON file for further inspection
    try {
      const outDir = 'tests/test_unit/output';
      mkdirSync(outDir, { recursive: true });
      writeFileSync(`${outDir}/extracted-items.json`, JSON.stringify(extracted.rfq_items, null, 2), 'utf8');
      console.log(`\nSaved extracted items to ${outDir}/extracted-items.json`);
    } catch (e) {
      console.warn('Could not write extracted items file:', e);
    }

    process.exit(0);
  } catch (err) {
    console.error('\n[TEST] extractAll() ✗ — Assertion failed');
    console.error(err);
    process.exit(1);
  }
}

run();
