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
        extracted_text: 'Inquiry No.:\nDate:\n\nJVPC-PRC-25-Q-201\n6-Jun-25\n\nRequisition ("PR") No.: PRD-25-PR-10337\nPR Approved (internal): 26-May-25\n\nTo:\n\nHoang Huy Trading & Services Co., Ltd\n\nFax No.: 0254 3572799\n\nAttn:\n\nMr. Nguyen Quang Huy, Director\n\nC.c:\n\nMr. Tran Ngoc Tuan, Group Manager, Suply Chain Group, JVPC\nMr. Do Van Dinh, Procurement Team Leader, JVPC\n\nPage(s): 5 pages (incl. this page)\nSubject:\n\nRequest for Quotation for Provision of Material for defectives Valves of Air Dryer\n\nDear Mr. Huy,\nWe would invite your company to submit proposal for provision of goods and/or services to support our petroleum operation in the Block 15-2, Vung Tau, Vietnam as hereunder.\nWe would request that your proposal submitted must be strictly in compliance with this request for quotation and its applicable documents hereunder. The proposal should be in Vietnam currency, and valid for a period of no lesser than forty-five (45) days, unless otherwise quoted. By submission of proposal, your company is deemed to accept those aforesaid requirements of the Company.\nDescription and requirement: as per Attachment 1 hereunder.\nTender\'s Closing Time:\n12:00 hours on 19-Jun-25.\nContract terms and condition: our standardized contract terms and condition is applied.\nProposal shall be submitted as below selected requirement, which is marked with :\nOption a: in sealed envelopes with two separate packages for technical and commercial proposal.\nOption b: via email by two separate emails i.e. one email for technical proposal, and other email for commercial proposal.\nPassword protection: the password protection for commercial proposal of Option b, if it is so required, shall be sent by another separate email to the under-signed and members in the Copy list as first mentioned above.\nKindly acknowledge receipt of this request and confirm your intention to submit proposal as soon as possible but not later than 12:00 hours on 7-Jun-25.\nSincerely yours,\n\n2025-06-06\n15:22:32\n\n____________________________\nNguyen Ai Thanh Dan\nSupply Chain Group\n\nPlease acknowledge receipt by return immediately via email transmission or to fax No.: 84-254-3856 942\nDate: .................................................................................................\nTime: ................................................................................................\nCompany: .......................................................................................\nYour name: ....................................................................................\n\nEnclosed: Attachment 1, 2 & 3\nCopy to: PRC, PRD\nPage 1\n\nSignature: ......................................................................................\n\nATTACHMENT 1: DESCRIPTIONS AND REQUIREMENTS\nClauses having  hereunder are valid only where  is marked therein.\n1.\n\nScope of Requirement\nNo\n\nMaximo #\n\n1\n\n217382\n\n2\n\n217376\n\n3\n\n204985\n\n4\n\n217377\n\n5\n\n217378\n\nDescription of Goods/Services\n<More details as per Attachment 2>\nCheck valve, swing, 2", 150#, RF (JVPC Spec A5R),\nCAPS order #155107, Crane 147XU 50NB Swing Check Valve\nTag: ACV1, ACV2 in drawing CCP-2898\nfor NULQ-SK-6111A/B\nValve, with Bettis CB415 actuator on Crane KF941, 2", 150#, RF, for NULQ-SK-6111A/B\nValve, Ball, 2", 150#, RF, Carbon Steel, Full Bore, ANSI B16-34, TVC KF941\nRepair kit for Bettis CB415 actuator, for NULQ-SK-6111A/B\n\nQTY (EA)\n\nAuto Drain Valve, CAPS order number 156091, for NULQ-SK6111A/B\n6\n217375\nValve, ball, 1-1/2inch,FB, 150#, RF, FV-1B, Outlet tower Left/Right, for NULQ- SK-6111C\n7\n217379\nPressure safety Valve, Hydroseal Model: 4FRVOL, 1" inlet/outlet, for NULQ-SK-6111C\n8\n215840\nRepair Kit for Metal Diaphragm Valve size 1-1/2", Ingersoll Rand, P/N: 630392, Tower inlet valve (FV-1A), for Air Dryer\nDeliverables: - CO, CQ, cert of compliance and other applicable certs\n9\nby MFR\n2. Price Terms (Incoterms 2020)\nPlease provide your price with one more delivery term as marked hereunder.\n\n3.\n\nEX Work/Warehouse\nF.C.A Bertling Freight Forwarder\nDAP Vung Tau\nDPU Vung Tau\nDDP Vung Tau\n\n4\n\n4\n\n4\n4\n6\n2\n1\n2\n1\n1\n\nF.O.B\nFAS\nCFR\nCIF Vung Tau/HCMC\nCPT Vung Tau/HCMC\nCIP Vung Tau/HCMC\n\nDelivery Time\n\nQuote possible shortest delivery time\nDesired delivery: Within 1-2 weeks\n\n4.\n\nTerms of Payment: arrear and by telegraphic transfer within 30 days after receipt original invoice with full back-up document.\n\n5.\n\nPreparation for Shipping:\nVendor is required to submit the following information for shipping along with your proposal: net weight, gross weight and dimensions (length, width and height in millimeters) of the Goods. Recommended appropriate packing method of the Goods.\n\n6.\n\nWarranty Period:\nThe warranty period shall be 24 months from the date of Goods received.\n\n7.\n\nSpecial Notes:\na. This Request for Quotation is solely treated as an invitation to quote, but not as an offer and/or order. Therefore, under no circumstance does it constitute as an intention to create legal relations between JVPC and your company.\nb. The Inquiry number and Requisition number as first mentioned in the cover letter must be clearly stated in your proposal and other documents attached thereto.\n\nPage 2\n\nThe Company does not undertake to accept the lowest price proposals.\nThe Company reserves it sole right to accept the proposal in whole or in part.\nThe cost of preparation of the proposal will be borne by you.\nYour proposal should be prepared in a complete proposal format with signature of authorized personnel.\ng. Contact persons for addressing on proposal and later correspondence exchanges are:\nJapan Vietnam Petroleum Company\n7th Floor, 8 Hoang Dieu Street, Vung Tau, S. R. Vietnam\nTel: 84-254-856.937\nFax: 84-254-856.942\nAttn: Nguyen Ai Thanh Dan, Procurement Administrator; nguyen.ai.thanh.dan@jvpc.com.vn\nCc: Mr. Tran Ngoc Tuan, Group Manager, Supply Chain Group; tran.ngoc.tuan@jvpc.com.vn\nCc: Mr. Do Van Dinh, Procurement Team Leader; do.van.dinh@jvpc.com.vn\n\nPage 3\n\nATTACHMENT 2: TECHNICAL SPECIFICATION AND REQUIREMENTS\nNo 1 2 3 4\nTitle: AirDryerNULQ-6111C / Sk-6111AB / Sk-6111ABbillofmateria / Sk-6111C\nDescription: AirDryer NULQ 6111C / DD220 Air Dryer Packgage, Piping & Instrumentation Diagram, CCP2884 / Air Compressor Package, Tag No.: NULQ-PK-6110, Bill of Material / HL Series Desiccant Dryer Models 120-2700\n*** Blank Hereunder in this Attachment ***\n\nPage 4\n\nATTACHMENT 3: CONTRACT GENERAL TERMS & CONDITIONS\nJVPC standardized contract terms and condition for intended contract will be applied. A copy of which will be provided upon being requested.\n*** Blank Hereunder in this Attachment ***\n\nPage 5',
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
// TEST INPUT — Sequence 2.2: incoming_email → rfq_analysis/analyze
// Different PR: 26-77902, different supplier
// =============================================

const SEQ_2_2_EMAIL = {
  data_type: 'incoming_email' as const,
  action_type: 'handleRFQ' as const,
  rfq_id: 2,
  workspace,
  incoming_email: {
    message_id: '<a2e94f8b52c7d91f@mail.outlook.com>',
    from_email: 'procurement@globaltech-solutions.com',
    from_name: 'GlobalTech Solutions, Inc.',
    to: ['bennguyenehk@gmail.com'],
    cc: [],
    subject: 'GlobalTech Solutions - RFQ for Industrial Pumping Equipment, PR 26-77902',
    email_body_text:
      'Dear Valued Partner,\r\n\r\nWe are pleased to invite your organization to submit a comprehensive proposal for the supply of industrial pumping equipment to support our offshore operations in the Gulf of Mexico.\r\n\r\nAll proposals must strictly adhere to the specifications outlined in this Request for Quotation and associated technical documentation. Quotes should be provided in USD currency, and must remain valid for a minimum of sixty (60) days from submission date. By submitting your proposal, you acknowledge acceptance of all terms and conditions stated herein.\r\n\r\nScope of Work: As detailed in Appendix A.\r\n\r\nTender Closing Time: 14:00 CST on 25-Jul-25.\r\n\r\nPayment Terms: Net 30 from invoice date. Standard commercial terms apply.\r\n\r\nSubmission Method: Single consolidated email containing both technical and commercial proposals as separate attachments.\r\n\r\nPlease confirm receipt and your intention to bid no later than 14:00 CST on 10-Jul-25.\r\n\r\nItem | Part Code | Equipment Specification | Unit QTY\r\n1 | GP-4500X | Centrifugal pump, 4500 GPM, 500 PSI, ISO 5199, Duplex SS | 2\r\n2 | MTR-250KW | Electric motor, 250 kW, 3-phase, 60Hz, NEMA frame 180M | 2\r\n3 | CBL-XL-500 | Heavy-duty coupling, min bore 2.5\", rated 250kW | 2\r\n4 | VLV-CK-3 | Check valve assembly, 3\", 600# RF, flanged ends | 3\r\n5 |  | Installation support, commissioning, and operator training | 1\r\n\r\nBest regards,\r\n\r\nDr. James Patterson\r\nProcurement Director\r\n\r\nGlobalTech Solutions, Inc.\r\nEnergy Division\r\n3500 Energy Plaza, Suite 1200\r\nHouston, TX 77001, USA\r\nPhone: +1-713-555-2847 | Email: j.patterson@globaltech-solutions.com\r\n\r\nThis communication contains proprietary information intended solely for the named recipient. Unauthorized access or distribution is strictly prohibited.',
    attachments_parsed: [
      {
        filename: 'RFQ_26-77902_Technical_Specs.pdf',
        content_type: 'application/pdf',
        extracted_text:
          '[PDF – 687 KB. Technical specifications and engineering drawings for PR 26-77902 industrial pumping system.]',
      },
      {
        filename: 'RFQ_26-77902_Terms_Conditions.pdf',
        content_type: 'application/pdf',
        extracted_text:
          '[PDF – 245 KB. Standard commercial terms, delivery schedules, and quality assurance requirements.]',
      },
    ],
    received_at: '2025-07-02T18:22:33Z',
  },
};

// =============================================
// TEST INPUT — Sequence 3.3: incoming_email → rfq_analysis/analyze
// Same PR: 25-10337, but modified deadline (earlier closing)
// =============================================

const SEQ_3_3_EMAIL = {
  data_type: 'incoming_email' as const,
  action_type: 'handleRFQ' as const,
  workspace,
  incoming_email: {
    message_id: '<2a84cf7a67e30462@mail.gmail.com>',
    from_email: 'hoanghuyco.sales@gmail.com',
    from_name: 'Hoang Huy Co., Ltd',
    to: ['bennguyenehk@gmail.com'],
    cc: [],
    subject: 'Hoang Huy] -RFQ AMENDED for Provision of Materials for Valves of Air Dryer, PR 25-10337',
    email_body_text:
      'Dear Mr.Huy\r\n\r\n** AMENDED RFQ — UPDATED DEADLINE & ITEM REVISION **\r\n\r\nPlease note that PR 25-10337 has been amended. The submission deadline has been moved forward due to project acceleration, and Item No.1 has been revised to a different valve specification. All other items and terms remain unchanged per our original RFQ.\r\n\r\nWe would invite your company to submit proposal for provision of goods and/or services to support our petroleum operation in the Block 15-2, Vung Tau, Vietnam as hereunder.\r\n\r\nWe would request that your proposal submitted must be strictly in compliance with this request for quotation and its applicable documents hereunder. The proposal should be in Vietnam currency, and valid for a period of no lesser than thirty (30) days, unless otherwise quoted. By submission of proposal, your company is deemed to accept those aforesaid requirements of the Company.\r\n\r\nDescription and requirement: as per Attachment 1 hereunder.\r\n\r\nTender\'s Closing Time: 12:00 hours on 12-Jun-25 [AMENDED - EARLIER DATE].\r\n\r\nContract terms and condition: our standardized contract terms and condition is applied.\r\n\r\nProposal shall be submitted as below selected requirement, which is marked with R:\r\n\r\nOption b: via email by two separate emails i.e. one email for technical proposal, and other email for commercial proposal.\r\n\r\nKindly acknowledge receipt of this amended notice and confirm your intention to submit proposal as soon as possible but not later than 12:00 hours on 31-May-25 [AMENDED - EARLIER DATE].\r\n\r\nNo | Maximo # | Description of Goods/Services <More details as per Attachment 2> | QTY (EA)\r\n1 | 217390 | Gate valve, 2\", 150#, RF, Bolted Bonnet, OS&Y, ANSI B16-34, Velan F12-1064C-02TY for NULQ-SK-6111A/B [AMENDED - REPLACES ITEM 217382] | 4\r\n2 | 217376 | Valve, with Bettis CB415 actuator on Crane KF941, 2\", 150#, RF, for NULQ-SK-6111A/B | 4\r\n3 | 204985 | Valve, Ball, 2\", 150#, RF, Carbon Steel, Full Bore, ANSI B16-34, TVC KF941 | 4\r\n4 | 217377 | Repair kit for Bettis CB415 actuator, for NULQ-SK-6111A/B | 6\r\n5 | 217378 | Auto Drain Valve, CAPS order number 156091, for NULQ-SK-6111A/B | 2\r\n6 | 217375 | Valve, ball, 1-1/2inch, FB, 150#, RF, FV-1B, Outlet tower Left/Right, for NULQ-SK-6111C | 1\r\n7 | 217379 | Pressure safety Valve, Hydroseal Model: 4FRVOL, 1\" inlet/outlet, for NULQ-SK-6111C | 2\r\n8 | 215840 | Repair Kit for Metal Diaphragm Valve size 1-1/2\", Ingersoll Rand, P/N: 630392, Tower inlet valve (FV-1A), for Air Dryer | 1\r\n9 |  | Deliverables: CO, CQ, cert of compliance and other applicable certs by MFR | 1\r\n\r\nThank you and Kind regards,\r\n\r\nNguyen Ai Thanh Dan (Ms.)\r\nSupply Chain Group\r\n\r\nJapan Vietnam Petroleum Company\r\nA Subsidiary of ENEOS Xplora\r\n7th Fl, PetroVietnam Tower, 08 Hoang Dieu, W.1, Vung Tau City, S.R.Vietnam\r\nT 84-254-3856937, Ext. 366      HP 84-903007794\r\n\r\nThis email (including any attachments) may contain confidential information and is intended only for the person or entity to which it is addressed. Dissemination, distribution or copying of this email by anyone other than the intended recipient is prohibited.',
    attachments_parsed: [
      {
        filename: 'RFQ to HHUY_25-201.pdf',
        content_type: 'application/pdf',
        extracted_text: 'Inquiry No.:\nDate:\n\nJVPC-PRC-25-Q-201 (AMENDED)\n28-May-25\n\nRequisition ("PR") No.: PRD-25-PR-10337\nPR Approved (internal): 26-May-25\n\nTo:\n\nHoang Huy Trading & Services Co., Ltd\n\nFax No.: 0254 3572799\n\nAttn:\n\nMr. Nguyen Quang Huy, Director\n\nC.c:\n\nMr. Tran Ngoc Tuan, Group Manager, Suply Chain Group, JVPC\nMr. Do Van Dinh, Procurement Team Leader, JVPC\n\nPage(s): 5 pages (incl. this page)\nSubject:\n\nAMENDED — Request for Quotation for Provision of Material for defectives Valves of Air Dryer\n\nDear Mr. Huy,\nThis is an amended version of our original RFQ JVPC-PRC-25-Q-201. The deadline has been moved forward and Item No.1 has been revised.\nWe would invite your company to submit proposal for provision of goods and/or services to support our petroleum operation in the Block 15-2, Vung Tau, Vietnam as hereunder.\nWe would request that your proposal submitted must be strictly in compliance with this request for quotation and its applicable documents hereunder. The proposal should be in Vietnam currency, and valid for a period of no lesser than thirty (30) days, unless otherwise quoted. By submission of proposal, your company is deemed to accept those aforesaid requirements of the Company.\nDescription and requirement: as per Attachment 1 hereunder.\nTender\'s Closing Time:\n12:00 hours on 12-Jun-25 [AMENDED].\nContract terms and condition: our standardized contract terms and condition is applied.\n\nATTACHMENT 1: DESCRIPTIONS AND REQUIREMENTS\n1.\n\nScope of Requirement\nNo\n\nMaximo #\n\n1\n\n217390\n\n2\n\n217376\n\n3\n\n204985\n\n4\n\n217377\n\n5\n\n217378\n\nDescription of Goods/Services\n<More details as per Attachment 2>\nGate valve, 2\", 150#, RF, Bolted Bonnet, OS&Y, ANSI B16-34,\nVelan F12-1064C-02TY\nfor NULQ-SK-6111A/B [AMENDED - REPLACES ITEM 217382]\nValve, with Bettis CB415 actuator on Crane KF941, 2\", 150#, RF, for NULQ-SK-6111A/B\nValve, Ball, 2\", 150#, RF, Carbon Steel, Full Bore, ANSI B16-34, TVC KF941\nRepair kit for Bettis CB415 actuator, for NULQ-SK-6111A/B\n\nQTY (EA)\n\nAuto Drain Valve, CAPS order number 156091, for NULQ-SK6111A/B\n6\n217375\nValve, ball, 1-1/2inch,FB, 150#, RF, FV-1B, Outlet tower Left/Right, for NULQ- SK-6111C\n7\n217379\nPressure safety Valve, Hydroseal Model: 4FRVOL, 1\" inlet/outlet, for NULQ-SK-6111C\n8\n215840\nRepair Kit for Metal Diaphragm Valve size 1-1/2\", Ingersoll Rand, P/N: 630392, Tower inlet valve (FV-1A), for Air Dryer\nDeliverables: - CO, CQ, cert of compliance and other applicable certs\n9\nby MFR\n\n4\n\n4\n\n4\n4\n6\n2\n1\n2\n1\n1',
      },
      {
        filename: 'RFQ_25-201_Att-2.pdf',
        content_type: 'application/pdf',
        extracted_text:
          '[PDF – 1.08 MB. Attachment 2 detailed technical datasheets and specifications for all 8 valve line items including drawings, standards, and MFR certs requirements.]',
      },
    ],
    received_at: '2025-05-28T10:15:47Z',
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
  console.log('=== Analyze-RFQ Prompt Integration Test (3 Sequences) ===\n');

  // ── Test Sequence 1 ──
  // console.log('\n>>> TEST 1: SEQ_1_1_EMAIL (PR 25-10337, Original Deadline)\n');
  // const t1 = await handleHTTPRequest(SEQ_1_1_EMAIL);
  // logResult(t1, 'Test 1', { rfq_ref: 'RFQ PR-25-10337', email: 'hoanghuyco.sales@gmail.com', items: 9, currency: 'VND', deadline: '2025-06-19' });
  // if (t1.success) await emitToPreview(t1 as unknown as Record<string, unknown>);

  // ── Test Sequence 2 ──
  // console.log('\n>>> TEST 2: SEQ_2_2_EMAIL (PR 26-77902, GlobalTech Solutions)\n');
  // const t2 = await handleHTTPRequest(SEQ_2_2_EMAIL);
  // logResult(t2, 'Test 2', { rfq_ref: 'RFQ PR-26-77902', email: 'procurement@globaltech-solutions.com', items: 5, currency: 'USD', deadline: '2025-07-25' });
  // if (t2.success) await emitToPreview(t2 as unknown as Record<string, unknown>);

  // ── Test Sequence 3 ──
  console.log('\n>>> TEST 3: SEQ_3_3_EMAIL (PR 25-10337, Amended Deadline + Item 1 Revised)\n');
  const t3 = await handleHTTPRequest(SEQ_3_3_EMAIL);
  logResult(t3, 'Test 3', { rfq_ref: 'RFQ PR-25-10337', email: 'hoanghuyco.sales@gmail.com', items: 9, currency: 'VND', deadline: '2025-06-12' });
  if (t3.success) await emitToPreview(t3 as unknown as Record<string, unknown>);

  // ── Summary ──
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  // console.log(`  Test 1 (original):        ${t1.success ? 'PASSED ✓' : 'FAILED ✗'}`);
  // console.log(`  Test 2 (new PR):          ${t2.success ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`  Test 3 (amended deadline): ${t3.success ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log('========================================\n');

  await pool.end();
  if (!t3.success ) process.exit(1);
}

/** Helper: Log result with validation */
function logResult(
  result: Record<string, unknown>,
  testName: string,
  expects: Record<string, unknown>
) {
  console.log(`${testName} Result:`);
  console.log(`  success:     ${result.success}`);
  console.log(`  data_type:   ${result.data_type}`);
  console.log(`  action_type: ${result.action_type}`);
  console.log(`  status:      ${result.status}`);
  if (result.error) console.log(`  error:       ${result.error}`);
  console.log(`  time:        ${result.processing_time_ms}ms`);

  if (result.success && result.data) {
    const data = result.data as MergedAnalysisData;
    console.log('\n  Validation:');
    console.log(`    rfq_reference:     ${data.rfq_reference} (expected: ${expects.rfq_ref})`);
    console.log(`    customer.email:    ${data.customer_info?.email} (expected: ${expects.email})`);
    console.log(`    rfq_items count:   ${data.rfq_items?.length} (expected: ${expects.items})`);
    console.log(`    currency:          ${data.required_currency} (expected: ${expects.currency})`);
    console.log(`    deadline contains: ${data.deadline_period} (expected to contain: ${expects.deadline})`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  pool.end().finally(() => process.exit(1));
});
