

// --- Only importing from hf-client.ts and analyze-rfq.ts ---
import {handleHTTPRequest} from '@/lib/data-processor';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';

const workspace = new WorkspaceContext({
  user_id: 1,       // renamed from client_id
  company_id: 1,
  username: 'test-runner',
  role: 'admin',
});


/** Raw email data matching the Json_method_plan.md Sequence 1.1 input */
const SEQ_1_1_EMAIL = {
  "data_type": "incoming_email" as const,   // literal type to match DataType
  "action_type": "handleRFQ" as const,      // literal type to match ActionType
  "incoming_email": {
    "message_id": "<unique-msg-id@sender.com>",       // for dedup (incoming_emails.message_id)
    "from_email": "james.rodriguez@pacificclimate.com",
    "from_name": "James Rodriguez",
    "to": ["sales@ourcompany.com"],
    "cc": ["lisa.park@pacificclimate.com", "robert.thompson@pacificclimate.com"],
    "subject": "RFQ - HVAC Equipment for Marina Boulevard Project",
    "email_body_text": "Dear Sir/Madam,\n\nWe would like to request a quotation for the following HVAC equipment for our Marina Boulevard project...",
    "attachments_parsed": [
      {
        "filename": "RFQ-HVAC-2026.pdf",
        "content_type": "application/pdf",
        "extracted_text": "ITEM 1: Industrial Chiller Unit, 50-Ton Capacity, Qty: 2 SETS..."
      },
      {
        "filename": "floor-plan-specs.png",
        "content_type": "image/png",
        "extracted_text": "Floor plan showing HVAC zones A through D, total area 5000 sqm..."
      }
    ],
    "received_at": "2026-03-31T10:00:00Z"
  },
  workspace,  // Inject test workspace for script context (no auth cookie available)
};



async function main() {
  console.log('=== Analyze-RFQ Prompt Integration Test ===');

  // Test 1 must finish before Test 2 (needs output1.json)
  const t1 =  await handleHTTPRequest(SEQ_1_1_EMAIL);

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`  Test 1 (analyze):    ${t1 ? 'PASSED' : 'FAILED'}`);
  console.log(`  Overall:             ${t1  ? 'ALL PASSED' : 'SOME FAILED'}`);

}

main();
