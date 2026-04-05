// =============================================
// RESPOND SERVICE ACTIONS - Supplier Response Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → AI extraction / manual override → DB update → ProcessorResult
// SSE emission is handled centrally by data-processor.ts (reads result.data.all_items_available)
//
// Supports:
//   update       — AI parses incoming supplier email, extracts per-item data, updates DB
//   available    — Manual UI override: mark specific items as available with pricing
//   unavailable  — Manual UI override: mark specific items as unavailable
//
// DB tables written:
//   supplier_item_status  — per-item status rows (status, unit_price, delivery_time, notes, responded_at)
//   quotation_items       — bidder_proposal fields (bidder_description, bidder_unit_price, delivery_time, compliance_deviation)
//   incoming_emails       — link rfq_id after matching

import { getData, updateData, insertData } from '@/lib/db/queries';
import { buildSupplierItemStatusPayload } from '@/lib/utils/databaseHandler';
import { getLocalModel } from '@/lib/ai-agent/local-model';
import { hfChatCompletion, SUPPLIER_RESPOND_SYSTEM_PROMPT } from '@/lib/ai-agent/hf-client';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
import type { WorkspaceContext } from '@/lib/middleware/workspace-context';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** AI inference mode: 'local' = run model locally, anything else = call remote API */
const AI_MODE = process.env.AI_MODE || 'remote';

// ---------------------------------------------
// Types
// ---------------------------------------------

/** Single item extracted by AI from supplier email */
interface ExtractedItem {
  item_id: number;                  // Matched quotation_items.item_id
  status: 'available' | 'unavailable';
  currency_code: string;
  bidder_proposal: {
    bidder_description: string;     // Supplier's product description
    bidder_unit_price: number;      // Quoted unit price
    delivery_time: string;          // e.g. "8 weeks ARO"
    compliance_deviation: string;   // Meets specs / deviations
  };
}

/** AI extraction result from supplier email */
interface AIExtractionResult {
  supplier_id: number;              // Matched supplier ID from DB
  supplier_name: string;            // Supplier display name
  rfq_id: number;                   // Matched RFQ ID
  items: ExtractedItem[];           // Per-item extracted data
  confidence: number;               // AI classification confidence (0-1)
}

/** Summary of item statuses for a given RFQ */
interface ItemsSummary {
  total: number;
  available: number;
  pending: number;
  unavailable: number;
}

// ---------------------------------------------
// Main Processor: Process Supplier Respond
// ---------------------------------------------

/**
 * Process supplier response based on action_type
 * - update: AI parses incoming email → extracts items → updates DB
 * - available/unavailable: Manual UI override → updates specific items
 * @param input - Validated ProcessorInput (data_type: 'respond_service')
 * @returns ProcessorResult with items_updated + all_items_available flag
 */
export async function processSupplierRespond(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type } = input;

    // Route by action_type
    if (action_type === 'update') {
      return await handleSupplierEmailResponse(input, startTime, timestamp);
    }
    // available / unavailable → manual UI override
    return await handleManualStatusUpdate(input, startTime, timestamp);
  } catch (error) {
    console.error('[Supplier Respond] Error:', error);

    const errorResult: ProcessorResult = {
      success: false,
      data_type: 'respond_service',
      action_type: input.action_type,
      status: 'error',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Supplier respond processing failed',
      timestamp,
    };

    // SSE emission handled centrally by data-processor
    return errorResult;
  }
}

// ---------------------------------------------
// Handler: AI-driven email response (update)
// ---------------------------------------------

/**
 * Process incoming supplier email via AI extraction:
 * 1. AI extracts per-item pricing/delivery/compliance from email body + attachments
 * 2. Match sender → existing supplier_item_status records
 * 3. Update supplier_item_status rows with extracted data
 * 4. Update quotation_items with bidder_proposal
 * 5. Link incoming_emails.rfq_id
 * 6. Check all_items_available → emit SSE
 */
async function handleSupplierEmailResponse(
  input: ProcessorInput,
  startTime: number,
  timestamp: string
): Promise<ProcessorResult> {
  const { workspace, incoming_email } = input;

  if (!incoming_email) {
    throw new Error('incoming_email data is required for respond_service:update');
  }
  if (!workspace) {
    throw new Error('workspace is required for respond_service:update');
  }

  // Step 1: AI extracts structured data from the email
  const extraction = await extractSupplierResponseFromEmail(incoming_email, workspace);

  // Step 2: Update supplier_item_status rows per extracted item
  const itemsUpdated = await updateSupplierItemStatuses(
    extraction.items,
    extraction.rfq_id,
    extraction.supplier_id,
    extraction.supplier_name,
    workspace,
    timestamp
  );

  // Step 3: Update quotation_items with bidder_proposal data
  await updateQuotationItemsBidderProposal(
    extraction.items,
    extraction.rfq_id,
    workspace
  );

  // Step 4: Link incoming_emails.rfq_id (non-blocking)
  try {
    await linkIncomingEmailToRfq(incoming_email.message_id, extraction.rfq_id, workspace);
  } catch (linkError) {
    console.warn('[Supplier Respond] Failed to link incoming_email to rfq (non-blocking):', linkError);
  }

  // Step 5: Check if ALL items for this RFQ are now available
  const summary = await checkAllItemsAvailable(extraction.rfq_id, workspace);
  const allAvailable = summary.total > 0 && summary.available === summary.total;

  // Build result matching Sequence 3 output schema
  const result: ProcessorResult = {
    success: true,
    data_type: 'respond_service',
    action_type: 'update',
    status: 'completed',
    session_id: '',
    processing_time_ms: Date.now() - startTime,
    data: {
      incoming_email_id: null, // Set by DB on insert
      classification: {
        type: 'respond_service',
        confidence: extraction.confidence,
      },
      rfq_id: extraction.rfq_id,
      supplier_id: extraction.supplier_id,
      supplier_name: extraction.supplier_name,
      items_updated: itemsUpdated,
      all_items_available: allAvailable,
      items_summary: summary,
    },
    timestamp,
  };

  // SSE emission (preview-update + comms-update) handled centrally by data-processor
  // data-processor reads result.data.all_items_available to decide comms-update

  return result;
}

// ---------------------------------------------
// Handler: Manual UI status override (available/unavailable)
// ---------------------------------------------

/**
 * Process manual status update from UI:
 * 1. Update supplier_item_status rows from input.respond_service.items
 * 2. Update quotation_items bidder_proposal (if status = available)
 * 3. Check all_items_available → emit SSE
 */
async function handleManualStatusUpdate(
  input: ProcessorInput,
  startTime: number,
  timestamp: string
): Promise<ProcessorResult> {
  const { action_type, rfq_id, respond_service, workspace } = input;

  if (!respond_service) {
    throw new Error('respond_service object is required for available/unavailable actions');
  }
  if (!rfq_id) {
    throw new Error('rfq_id is required for respond_service available/unavailable');
  }
  if (!workspace) {
    throw new Error('workspace is required for respond_service');
  }

  const { supplier_id, items } = respond_service;

  // Determine target status from action_type
  const targetStatus = action_type === 'available' ? 'available' : 'unavailable';

  // Convert input items to ExtractedItem format for unified DB update
  const extractedItems: ExtractedItem[] = items.map((item) => ({
    item_id: item.item_id,
    status: targetStatus as 'available' | 'unavailable',
    currency_code: 'USD', // Default currency for manual overrides
    bidder_proposal: {
      bidder_description: item.notes || '',
      bidder_unit_price: item.unit_price || 0,
      delivery_time: item.delivery_time || '',
      compliance_deviation: item.notes || '',
    },
  }));

  // Step 1: Update supplier_item_status rows
  const itemsUpdated = await updateSupplierItemStatuses(
    extractedItems,
    rfq_id,
    supplier_id,
    '', // supplier_name not needed for manual update
    workspace,
    timestamp
  );

  // Step 2: Update quotation_items bidder_proposal (only for available items)
  if (targetStatus === 'available') {
    await updateQuotationItemsBidderProposal(extractedItems, rfq_id, workspace);
  }

  // Step 3: Check all_items_available
  const summary = await checkAllItemsAvailable(rfq_id, workspace);
  const allAvailable = summary.total > 0 && summary.available === summary.total;

  const result: ProcessorResult = {
    success: true,
    data_type: 'respond_service',
    action_type,
    status: 'completed',
    session_id: '',
    processing_time_ms: Date.now() - startTime,
    data: {
      rfq_id,
      supplier_id,
      items_updated: itemsUpdated,
      all_items_available: allAvailable,
      items_summary: summary,
    },
    timestamp,
  };

  // SSE emission (preview-update + comms-update) handled centrally by data-processor
  // data-processor reads result.data.all_items_available to decide comms-update

  return result;
}

// ---------------------------------------------
// AI Extraction: Parse supplier email
// ---------------------------------------------

/**
 * Use AI to extract structured supplier response data from email body + attachments.
 * Matches sender email → existing supplier in supplier_item_status table.
 * Returns per-item pricing, delivery, compliance info.
 *
 * Local mode: runs model in-process via local-model
 * Remote mode: calls HuggingFace Inference API
 */
async function extractSupplierResponseFromEmail(
  emailData: { from_email: string; from_name: string; subject: string; email_body_text: string; attachments_parsed?: Array<{ filename: string; content_type: string; extracted_text: string }> },
  workspace: WorkspaceContext
): Promise<AIExtractionResult> {
  // Combine email body + attachment text for AI context
  const fullContent = buildEmailContent(emailData);

  // Try to match sender to an existing supplier via DB lookup
  const supplierMatch = await matchSenderToSupplier(emailData.from_email, workspace);

  // Build user message with full email context for AI extraction
  const userMessage = `From: ${emailData.from_name} <${emailData.from_email}>\nSubject: ${emailData.subject}\n\nEmail Body:\n${fullContent}${supplierMatch ? `\n\nContext: Supplier ID ${supplierMatch.supplierId}, RFQ ID ${supplierMatch.rfqId}` : ''}`;

  // Call AI (local or remote) — both use the same prompt + message pattern
  let extracted: { supplier_name: string; items: ExtractedItem[]; confidence: number };
  if (AI_MODE === 'local') {
    console.log('[Supplier Respond] Using local AI model for extraction');
    // Generic chatCompletion<T> matches hf-client pattern
    extracted = await getLocalModel().chatCompletion<typeof extracted>(SUPPLIER_RESPOND_SYSTEM_PROMPT, userMessage);
  } else {
    console.log('[Supplier Respond] Using HF Inference API for extraction');
    extracted = await hfChatCompletion<typeof extracted>(SUPPLIER_RESPOND_SYSTEM_PROMPT, userMessage);
  }

  // Fail fast if supplier could not be matched — prevent orphaned records with id=0
  if (!supplierMatch) {
    console.warn(`[Supplier Respond] Unmatched supplier from ${emailData.from_email}, skipping database updates`);
    throw new Error(
      `Could not match supplier for email from ${emailData.from_email}. ` +
      `Ensure the sender domain or company name exists in your supplier database.`
    );
  }

  return {
    supplier_id: supplierMatch.supplierId,
    supplier_name: extracted.supplier_name || emailData.from_name,
    rfq_id: supplierMatch.rfqId,
    items: extracted.items || [],
    confidence: extracted.confidence || 0.8,
  };
}

/**
 * Combine email body + parsed attachment text into a single string for AI context
 */
function buildEmailContent(emailData: { email_body_text: string; attachments_parsed?: Array<{ filename: string; extracted_text: string }> }): string {
  const parts: string[] = [];

  // Add email body
  if (emailData.email_body_text) {
    parts.push('--- EMAIL BODY ---');
    parts.push(emailData.email_body_text);
  }

  // Add extracted attachment text (skip failed extractions)
  for (const att of emailData.attachments_parsed || []) {
    if (att.extracted_text && att.extracted_text !== '[extraction_failed]') {
      parts.push(`--- ATTACHMENT: ${att.filename} ---`);
      parts.push(att.extracted_text);
    }
  }

  return parts.join('\n\n');
}

// ---------------------------------------------
// DB Operations
// ---------------------------------------------

/**
 * Match sender email to an existing supplier in supplier_item_status table.
 * Queries by supplierName/sourceUrl patterns that might contain the sender domain.
 * Returns the first match with rfqId + supplierId.
 */
async function matchSenderToSupplier(
  senderEmail: string,
  workspace: WorkspaceContext
): Promise<{ rfqId: number; supplierId: number; supplierName: string } | null> {
  try {
    // Extract domain from sender email (e.g., "daikin.com.sg" from "quotations@daikin.com.sg")
    const domain = senderEmail.split('@')[1];
    if (!domain) return null;

    // Extract primary domain name (e.g., "daikin" from "daikin.com.sg" or "mail.daikin.com")
    // Split by dots and pick the second-to-last segment (primary brand name)
    const domainParts = domain.split('.');
    const primaryName = domainParts.length >= 3 ? domainParts[domainParts.length - 3] : domainParts[0];

    // Query all supplier_item_status records and filter by domain match
    // (Drizzle doesn't support LIKE in generic getData, so we fetch and filter)
    const allStatuses = await getData('supplierItemStatus', {}, workspace) as Array<Record<string, unknown>>;

    // Find a supplier whose name or source_url contains the sender domain
    const match = allStatuses.find((row) => {
      const name = String(row.supplierName || '').toLowerCase();
      const url = String(row.sourceUrl || '').toLowerCase();
      // Match by: full domain in URL, or primary brand name in supplier name
      return url.includes(domain) || name.includes(primaryName.toLowerCase());
    });

    if (match) {
      return {
        rfqId: Number(match.rfqId),
        supplierId: Number(match.supplierId),
        supplierName: String(match.supplierName || ''),
      };
    }

    return null;
  } catch (error) {
    console.warn('[Supplier Respond] Sender match lookup failed:', error);
    return null;
  }
}

/**
 * Update supplier_item_status rows for each extracted item.
 * Sets status, unit_price, delivery_time, notes, responded_at.
 * Returns array of updated item summaries for the response.
 */
async function updateSupplierItemStatuses(
  items: ExtractedItem[],
  rfqId: number,
  supplierId: number,
  supplierName: string,
  workspace: WorkspaceContext,
  timestamp: string
): Promise<Array<Record<string, unknown>>> {
  const updatedItems: Array<Record<string, unknown>> = [];

  for (const item of items) {
    try {
      // Check if a supplier_item_status row exists for this rfq + item + supplier
      const existing = await getData(
        'supplierItemStatus',
        { rfqId, itemId: item.item_id, supplierId },
        workspace
      ) as Array<Record<string, unknown>>;

      // Build payload for update/insert
      const statusPayload = buildSupplierItemStatusPayload({
        status: item.status,
        unit_price: item.bidder_proposal.bidder_unit_price,
        delivery_time: item.bidder_proposal.delivery_time,
        notes: item.bidder_proposal.compliance_deviation,
        responded_at: timestamp,
        supplier_id: supplierId,
        supplier_name: supplierName || undefined,
      }, true); // update mode — exclude PK/FK

      if (existing.length > 0) {
        // UPDATE existing row
        await updateData(
          'supplierItemStatus',
          { rfqId, itemId: item.item_id, supplierId },
          statusPayload,
          workspace
        );
        console.log(`[Supplier Respond] Updated supplier_item_status: item_id=${item.item_id}, status=${item.status}`);
      } else {
        // INSERT new row (include PK/FK fields)
        const insertPayload = buildSupplierItemStatusPayload({
          rfq_id: rfqId,
          item_id: item.item_id,
          supplier_id: supplierId,
          supplier_name: supplierName,
          status: item.status,
          unit_price: item.bidder_proposal.bidder_unit_price,
          delivery_time: item.bidder_proposal.delivery_time,
          notes: item.bidder_proposal.compliance_deviation,
          responded_at: timestamp,
        }, false); // insert mode — include all fields
        await insertData('supplierItemStatus', {}, insertPayload, workspace);
        console.log(`[Supplier Respond] Inserted supplier_item_status: item_id=${item.item_id}, status=${item.status}`);
      }

      // Build summary for response output
      updatedItems.push({
        item_id: item.item_id,
        status: item.status,
        currency_code: item.currency_code,
        bidder_proposal: item.bidder_proposal,
      });
    } catch (dbError) {
      console.error(`[Supplier Respond] DB error updating item ${item.item_id}:`, dbError);
      // Continue processing other items — don't fail the entire batch
    }
  }

  return updatedItems;
}

/**
 * Update bidder_proposal data from supplier response.
 * NOTE: Bidder fields (bidder_description, bidder_unit_price, delivery_time, compliance_deviation)
 * moved from rfq_items to supplier_item_status table. These are now written by
 * updateSupplierItemStatuses() above. This function is kept as a no-op for call-site compatibility.
 */
async function updateQuotationItemsBidderProposal(
  _items: ExtractedItem[],
  _rfqId: number,
  _workspace: WorkspaceContext
): Promise<void> {
  // Bidder fields now live on supplier_item_status and are written by updateSupplierItemStatuses().
  // No separate rfq_items update needed.
}

/**
 * Link incoming_emails row to the matched rfq_id.
 * Updates incoming_emails.rfq_id and classification fields.
 */
async function linkIncomingEmailToRfq(
  messageId: string,
  rfqId: number,
  workspace: WorkspaceContext
): Promise<void> {
  // Find incoming_email by message_id
  const emails = await getData('incomingEmails', {}, workspace) as Array<Record<string, unknown>>;
  const match = emails.find((e) => e.messageId === messageId);

  if (match && match.id) {
    await updateData(
      'incomingEmails',
      { id: Number(match.id) },
      {
        rfqId,
        classificationType: 'respond_service',
        classificationConfidence: '0.93',
        processedAt: new Date(),
      },
      workspace
    );
    console.log(`[Supplier Respond] Linked incoming_email ${messageId} → rfq_id=${rfqId}`);
  }
}

/**
 * Check if ALL supplier_item_status rows for a given rfq_id have status = 'available'.
 * Returns a summary object with total/available/pending/unavailable counts.
 */
async function checkAllItemsAvailable(
  rfqId: number,
  workspace: WorkspaceContext
): Promise<ItemsSummary> {
  try {
    const allStatuses = await getData(
      'supplierItemStatus',
      { rfqId },
      workspace
    ) as Array<Record<string, unknown>>;

    const summary: ItemsSummary = {
      total: allStatuses.length,
      available: 0,
      pending: 0,
      unavailable: 0,
    };

    // Count each status type
    for (const row of allStatuses) {
      const status = String(row.status || 'pending');
      if (status === 'available') summary.available++;
      else if (status === 'unavailable') summary.unavailable++;
      else summary.pending++;
    }

    return summary;
  } catch (error) {
    console.error('[Supplier Respond] Error checking all items status:', error);
    return { total: 0, available: 0, pending: 0, unavailable: 0 };
  }
}

