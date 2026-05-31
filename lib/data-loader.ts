/* eslint-disable @typescript-eslint/no-explicit-any */
// getData() returns any[] — row mapping throughout this file requires `any` annotations

/**
 * =============================================
 * DATA LOADER - DB -> ProcessorInput Builder (2-Level Map)
 * =============================================
 * Purpose: Load existing data from the database and construct a complete
 * ProcessorInput for pipeline chaining (e.g., "proceed" action).
 *
 * Architecture:
 *   data-processor.ts receives a "proceed" action ->
 *   data-loader.ts routes via PAYLOAD_LOADERS[data_type][action_type] ->
 *   dedicated builder loads DB state and returns exact JSON shape ->
 *   data-processor can route the result normally.
 *
 * This is a plain server-side module (NOT a server action).
 * It is consumed only by data-processor.ts during pipeline chaining.
 */

import { getData } from '@/lib/db/queries';
import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import type { DataType, ActionType, ProcessorInput } from '@/lib/utils/validator';

// =============================================
// Types
// =============================================

/** Parameters required to load a ProcessorInput from DB */
interface LoaderParams {
  data_type: DataType;
  action_type: ActionType;
  workspace: WorkspaceContext;
  rfq_id?: number;        // Optional — most flows use this
  quotation_id?: number;  // Optional — quotation flows
  email_id?: number;      // Optional — email flows
  overrides?: Partial<ProcessorInput>;
}

/** Builder function signature — each data_type+action_type pair has one */
type BuilderFn = (
  params: LoaderParams
) => Promise<Partial<ProcessorInput>>;

// =============================================
// rfq_analysis BUILDERS
// =============================================

/**
 * rfq_analysis + analyze: Load from incoming_emails table.
 * Builds the exact JSON shape of rfq-analysis.json Input_1.
 * Source: incomingEmails (by rfq_id)
 */
async function loadRfqAnalysisAnalyzeInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, workspace } = params;
  if (!rfq_id) throw new Error('[data-loader] rfq_id required for rfq_analysis/analyze');

  // Fetch the incoming email linked to this RFQ
  const emailRows = await getData('incomingEmails', { rfqId: rfq_id }, workspace);
  if (!emailRows.length) {
    throw new Error(`[data-loader] No incomingEmails found for rfq_id=${rfq_id}`);
  }

  const email = emailRows[0]; // Most recent email for this RFQ

  return {
    rfq_id,
    incoming_email: {
      message_id: email.messageId ?? '',                   // Dedup ID from email headers
      from_email: email.fromEmail ?? '',                   // Sender email address
      from_name: email.fromName ?? '',                     // Sender display name
      to: email.toRecipients ?? [],                        // TO recipients array
      cc: email.ccRecipients ?? [],                        // CC recipients array
      subject: email.subject ?? '',                        // Email subject line
      email_body_text: email.emailBodyText ?? '',          // Plain-text body
      attachments_parsed: (email.attachmentsParsed ?? []) as Array<{ filename: string; content_type: string; extracted_text: string }>, // Parsed attachment objects (jsonb)
      received_at: email.receivedAt?.toISOString() ?? '',  // ISO 8601 timestamp
    },
  };
}

/**
 * rfq_analysis + reanalyze: Load from rfqAnalysis + rfqItems.
 * Builds the exact JSON shape of rfq-analysis.json Input_2.
 * Sources: rfqAnalysis (subject, analysis_content, rfq_reference), rfqItems (item list)
 */
async function loadRfqAnalysisReanalyzeInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, workspace } = params;
  if (!rfq_id) throw new Error('[data-loader] rfq_id required for rfq_analysis/reanalyze');

  // Fetch analysis data (subject + analysis_content)
  const analysisRows = await getData('rfqAnalysis', { rfqId: rfq_id }, workspace);
  if (!analysisRows.length) {
    throw new Error(`[data-loader] No rfqAnalysis found for rfq_id=${rfq_id}`);
  }
  const analysis = analysisRows[0];

  // Fetch RFQ items linked to this analysis
  const itemRows = await getData('rfqItems', { rfqId: rfq_id }, workspace);

  // rfq_reference lives on rfq_analysis table (single source of truth)
  const rfqReference = String(analysis.rfqReference ?? '');

  // currency_code now lives on supplier_item_status. For rfq_analysis input
  // (pre-supplier stage), use rfq_analysis.required_currency as buyer's
  // requested transfer currency.
  const requiredCurrency = String(analysis.requiredCurrency ?? 'USD');

  // Build rfq_items array matching rfq-analysis.json Input_2 shape
  const rfqItems = itemRows.map((item: any) => ({
    item_id: String(item.itemId),                       // String ID as per JSON sample
    currency_code: requiredCurrency,                    // Sourced from rfq_analysis.required_currency
    company_requirement: {
      company_description: item.companyDescription ?? '', // Item description
      qty: item.qty ? Number(item.qty) : 1,              // Quantity (numeric -> number)
      uom: item.uom ?? '',                               // Unit of measure
    },
  }));

  return {
    rfq_id,
    rfq_reference: rfqReference,
    analysis: {
      subject: analysis.subject ?? '',                   // Analysis subject line
      analysis_content: analysis.analysisContent ?? '',  // Full analysis content
    },
    rfq_items: rfqItems,                                 // Structured item list
  };
}

// =============================================
// supplier_search BUILDERS
// =============================================

/**
 * supplier_search + search: Load from rfqAnalysis (rfq_reference, subject, analysis_content).
 * Builds the exact JSON shape of supplier-search.json Input_1.
 * Sources: rfqAnalysis (rfq_reference, subject, analysis_content)
 */
async function loadSupplierSearchSearchInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, workspace } = params;
  if (!rfq_id) throw new Error('[data-loader] rfq_id required for supplier_search/search');

  // Fetch rfqAnalysis for subject + analysis_content
  const analysisRows = await getData('rfqAnalysis', { rfqId: rfq_id }, workspace);
  if (!analysisRows.length) {
    throw new Error(`[data-loader] No rfqAnalysis found for rfq_id=${rfq_id}`);
  }
  const analysis = analysisRows[0];

  // rfq_reference lives on rfq_analysis table (single source of truth)
  const rfqReference = String(analysis.rfqReference ?? '');

  return {
    rfq_id,
    rfq_reference: rfqReference,
    analysis: {
      subject: analysis.subject ?? '',                   // Analysis subject
      analysis_content: analysis.analysisContent ?? '',  // Full analysis content used as search basis
    },
  };
}

/**
 * supplier_search + research: Load from supplierSearch + supplierItemStatus + rfqAnalysis.
 * Builds the exact JSON shape of supplier-search.json Input_2.
 * Sources: supplierSearch (search_id, subject, search_content), supplierItemStatus (items_source), rfqAnalysis (rfq_reference)
 */
async function loadSupplierSearchResearchInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, workspace } = params;
  if (!rfq_id) throw new Error('[data-loader] rfq_id required for supplier_search/research');

  // Fetch existing supplier search record
  const searchRows = await getData('supplierSearch', { rfqId: rfq_id }, workspace);
  if (!searchRows.length) {
    throw new Error(`[data-loader] No supplierSearch found for rfq_id=${rfq_id}`);
  }
  const searchRecord = searchRows[0];

  // Fetch all supplier item statuses for this RFQ
  const itemRows = await getData('supplierItemStatus', { rfqId: rfq_id }, workspace);

  // rfq_reference lives on rfq_analysis table (single source of truth)
  const analysisRows = await getData('rfqAnalysis', { rfqId: rfq_id }, workspace);
  const rfqReference = String(analysisRows[0]?.rfqReference ?? '');

  // Build items_source array matching supplier-search.json Input_2 shape
  const itemsSource = itemRows.map((item: any) => ({
    item_id: item.itemId ?? 0,                             // FK to rfq_items
    supplier_id: item.supplierId ?? 0,                     // Supplier identifier
    supplier_name: item.supplierName ?? '',                // Supplier display name
    source_url: item.sourceUrl ?? '',                      // Where supplier was found
    status: item.status ?? 'pending',                      // pending | available | unavailable
    delivery_time: item.deliveryTime ?? '',                // Supplier's delivery estimate
    bidder_description: item.bidderDescription ?? '',      // Supplier's product description
    bidder_unit_price: item.bidderUnitPrice ? Number(item.bidderUnitPrice) : 0, // Unit price (numeric -> number)
    currency_code: item.currencyCode ?? 'USD',             // Per-supplier proposal currency
    compliance_deviation: item.complianceDeviation ?? '',  // Spec compliance notes
    notes: item.notes ?? '',                               // Supplier notes
    contact_email: item.contactEmail ?? '',                // Supplier contact email
    contact_phone: item.contactPhone ?? '',                // Supplier contact phone
    requires_quote: item.requiresQuote ?? false,           // Page needs a manual quote request
    page_type: item.pageType ?? 'product',                 // 'product' | 'tech_spec'
  }));

  return {
    rfq_id,
    rfq_reference: rfqReference,
    search: {
      subject: searchRecord.subject ?? '',                 // Search subject
      search_content: searchRecord.searchContent ?? '',    // Search results summary
    },
    items_source: itemsSource,                             // Supplier items array
  } as Partial<ProcessorInput>;
}

// =============================================
// quotation BUILDERS
// =============================================

/**
 * quotation + generate/update: Load from quotations + rfqItems + supplierItemStatus(ordered) + customers + rfqAnalysis.
 * Builds the exact JSON shape of quotation_Inpt.json.
 * When no quotation record exists yet (first generate from items_ordering), builds from rfq_id directly
 * without requiring a pre-existing quotation row — the processor will INSERT the new record.
 * Sources: quotations (optional), rfqItems (company_requirement),
 *          supplierItemStatus (status=ordered), customers (customer_info), rfqAnalysis (rfq_reference)
 */
async function loadQuotationGenerateInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, quotation_id, workspace } = params;

  if (!rfq_id && !quotation_id) {
    throw new Error('[data-loader] rfq_id or quotation_id required for quotation/generate');
  }

  // Try to find existing quotation (prefer quotation_id, fallback to rfq_id).
  // When no quotation exists yet (first generate from items_ordering) we build from rfq_id directly.
  let quotationRows: any[];
  if (quotation_id) {
    quotationRows = await getData('quotations', { quotationId: quotation_id }, workspace);
  } else {
    quotationRows = await getData('quotations', { rfqId: rfq_id }, workspace);
  }

  const quotation = quotationRows.length > 0 ? quotationRows[0] : null;
  const resolvedRfqId = quotation ? quotation.rfqId : rfq_id!;   // Fall back to supplied rfq_id
  const resolvedQuotationId: number | undefined = quotation ? quotation.quotationId : undefined;

  // Fetch RFQ items for company_requirement
  const itemRows = await getData('rfqItems', { rfqId: resolvedRfqId }, workspace);

  // Fetch ordered supplier items (status = 'ordered' — set when operator awards a supplier)
  const supplierRows = await getData(
    'supplierItemStatus',
    { rfqId: resolvedRfqId, status: 'ordered' },
    workspace
  );

  // Index supplier items by item_id (first ordered supplier per item wins)
  const supplierByItem = new Map<number, any>();
  for (const s of supplierRows) {
    if (s.itemId && !supplierByItem.has(s.itemId)) supplierByItem.set(s.itemId, s);
  }

  // Fetch customer info linked to this RFQ
  const customerRows = await getData('customers', { rfqId: resolvedRfqId }, workspace);
  const customer = customerRows[0];

  // Fetch seller company info
  const companyRows = await getData(
    'userCompany',
    { companyId: workspace.getDatabaseFilter().company_id },
    workspace
  );
  const company = companyRows[0];

  // rfq_reference lives on rfq_analysis (single source of truth)
  const analysisRows = await getData('rfqAnalysis', { rfqId: resolvedRfqId }, workspace);
  const rfqReference = String(analysisRows[0]?.rfqReference ?? '');

  // Build quotation_items array matching quotation_Inpt.json shape
  const quotationItems = itemRows.map((item: any) => {
    const supplier = supplierByItem.get(item.itemId); // Matching ordered supplier (if any)
    return {
      item_id: item.itemId,                                  // Numeric item ID
      currency_code: supplier?.currencyCode ?? 'USD',        // Sourced from supplier_item_status (per-supplier proposal)
      company_requirement: {
        company_description: item.companyDescription ?? '',  // Item description from RFQ
        qty: item.qty ? Number(item.qty) : 1,                // Quantity
        uom: item.uom ?? '',                                 // Unit of measure
      },
      bidder_proposal: {
        bidder_description: supplier?.bidderDescription ?? '',      // Supplier's product description
        bidder_unit_price: supplier?.bidderUnitPrice ? Number(supplier.bidderUnitPrice) : 0, // Unit price
        delivery_time: supplier?.deliveryTime ?? '',                // Delivery estimate
        compliance_deviation: supplier?.complianceDeviation ?? '',  // Compliance notes
      },
    };
  });

  return {
    rfq_id: resolvedRfqId,
    quotation_id: resolvedQuotationId,
    quotation_data: {
      quotation_id: resolvedQuotationId,                     // Undefined on first generate → processor INSERTs
      rfq_reference: rfqReference,                           // RFQ reference string
      customer_info: {
        company_name: customer?.companyName ?? '',            // Customer company name
        attention_person: customer?.attentionPerson ?? '',    // Primary contact
        carbon_copy_person: customer?.carbonCopyPerson ?? [], // CC recipients
        email: customer?.email ?? '',                        // Customer email
        phone: customer?.phone ?? '',                        // Customer phone
        fax_number: customer?.faxNumber ?? '',               // Customer fax
        customer_address: customer?.customerAddress ?? '',    // Customer address
      },
      seller_info: {
        company_name: company?.companyName ?? '',
        address: company?.companyAddress ?? '',
        tel: company?.companyNumber ?? '',     // user_company.company_number holds the seller phone
        phone: company?.companyNumber ?? '',   // same column; some UI paths read .phone
        fax_number: company?.companyFax ?? '',
        email: company?.companyEmail ?? '',
      },
      quotation_items: quotationItems,                       // Items with bidder proposals
      commercial_terms: quotation?.commercialTerms ?? '',    // Terms and conditions
    },
  };
}

/**
 * quotation + manual_update: Load from quotationPricing + userCompany + supplierItemStatus + userInfo + customers + rfqItems + quotations + rfqAnalysis.
 * Builds the exact JSON shape of quotation_ui_manual.json.
 * Uses rfq_id for quotationPricing and quotations lookups.
 * Sources: quotations, quotationPricing (pricing data), userCompany (seller_info),
 *          supplierItemStatus (bidder proposals), userInfo, customers, rfqItems, rfqAnalysis (rfq_reference)
 */
async function loadQuotationManualUpdateInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, quotation_id, workspace } = params;

  // Fetch quotation record
  let quotationRows: any[];
  if (quotation_id) {
    quotationRows = await getData('quotations', { quotationId: quotation_id }, workspace);
  } else if (rfq_id) {
    quotationRows = await getData('quotations', { rfqId: rfq_id }, workspace);
  } else {
    throw new Error('[data-loader] quotation_id or rfq_id required for quotation/manual_update');
  }

  if (!quotationRows.length) {
    throw new Error(`[data-loader] No quotation found for quotation_id=${quotation_id}, rfq_id=${rfq_id}`);
  }
  const quotation = quotationRows[0];
  const resolvedRfqId = quotation.rfqId;
  const resolvedQuotationId = quotation.quotationId;

  // Fetch pricing data for this quotation
  const pricingRows = await getData('quotationPricing', { quotationId: resolvedQuotationId }, workspace);

  // Index pricing by item_id
  const pricingByItem = new Map<number, any>();
  for (const p of pricingRows) {
    if (p.itemId) pricingByItem.set(p.itemId, p);
  }

  // Fetch seller info (user's company)
  const companyRows = await getData('userCompany', { companyId: workspace.getDatabaseFilter().company_id }, workspace);
  const company = companyRows[0];

  // Fetch ordered supplier items (rfq_id + status = 'ordered')
  const supplierRows = await getData(
    'supplierItemStatus',
    { rfqId: resolvedRfqId, status: 'ordered' },
    workspace
  );
  const supplierByItem = new Map<number, any>();
  for (const s of supplierRows) {
    if (s.itemId) supplierByItem.set(s.itemId, s);
  }

  // Fetch customer info
  const customerRows = await getData('customers', { rfqId: resolvedRfqId }, workspace);
  const customer = customerRows[0];

  // Fetch RFQ items
  const itemRows = await getData('rfqItems', { rfqId: resolvedRfqId }, workspace);

  // rfq_reference lives on rfq_analysis (single source of truth)
  const analysisRows = await getData('rfqAnalysis', { rfqId: resolvedRfqId }, workspace);
  const rfqReference = String(analysisRows[0]?.rfqReference ?? '');

  // Build quotation_items with pricing + bidder info matching quotation_ui_manual.json
  const quotationItems = itemRows.map((item: any) => {
    const pricing = pricingByItem.get(item.itemId);
    const supplier = supplierByItem.get(item.itemId);
    return {
      item_id: item.itemId,                                        // Numeric ID
      sales_unit_price: pricing?.salesUnitPrice ? Number(pricing.salesUnitPrice) : 0,  // Calculated sales price
      ext_price: pricing?.extPrice ? Number(pricing.extPrice) : 0,                     // Extended price (qty * unit)
      company_requirement: {
        company_description: item.companyDescription ?? '',        // Item description from RFQ
        qty: item.qty ? Number(item.qty) : 1,                     // Quantity
        uom: item.uom ?? '',                                      // Unit of measure
      },
      bidder_proposal: {
        bidder_description: supplier?.bidderDescription ?? '',     // Supplier's description
        delivery_time: supplier?.deliveryTime ?? '',               // Delivery estimate
        compliance_deviation: supplier?.complianceDeviation ?? '', // Compliance notes
      },
    };
  });

  return {
    rfq_id: resolvedRfqId,
    quotation_id: resolvedQuotationId,
    quotation_data: {
      quotation_id: resolvedQuotationId,                   // Quotation PK
      quotation_name: quotation.quotationName ?? '',       // Display name
      rfq_reference: rfqReference,                         // RFQ reference
      total_amount: quotation.totalAmount ? Number(quotation.totalAmount) : 0, // Total amount
      quotation_date: quotation.generatedDay ?? '',        // Generation date
      page_number: '1',                                    // Default page 1
      commercial_terms: quotation.commercialTerms ?? '',   // Terms text
      seller_info: {
        company_name: company?.companyName ?? '',
        address: company?.companyAddress ?? '',
        tel: company?.companyNumber ?? '',
        phone: company?.companyNumber ?? '',
        fax_number: company?.companyFax ?? '',
        email: company?.companyEmail ?? '',
      },
      customer_info: {
        company_name: customer?.companyName ?? '',          // Customer company name
        customer_name: customer?.companyName ?? '',         // Alias for company_name
        attention_person: customer?.attentionPerson ?? '',  // Primary contact
        carbon_copy_person: customer?.carbonCopyPerson ?? [], // CC list
        email: customer?.email ?? '',                       // Customer email
        tel: customer?.phone ?? '',                         // Customer tel
        phone: customer?.phone ?? '',                       // Customer phone
        fax_number: customer?.faxNumber ?? '',              // Customer fax
        address: customer?.customerAddress ?? '',           // Customer address
      },
      quotation_items: quotationItems,                     // Items with pricing + bidder
    },
  } as unknown as Partial<ProcessorInput>;
}

/**
 * quotation + calculate: Load from quotationPricing.
 * Builds the exact JSON shape of quotation_calulate.json.
 * Uses quotation_id to fetch pricing variables.
 * Source: quotationPricing (by quotation_id)
 */
async function loadQuotationCalculateInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { quotation_id, workspace } = params;
  if (!quotation_id) throw new Error('[data-loader] quotation_id required for quotation/calculate');

  // Fetch all pricing rows for this quotation
  const pricingRows = await getData('quotationPricing', { quotationId: quotation_id }, workspace);
  if (!pricingRows.length) {
    throw new Error(`[data-loader] No quotationPricing found for quotation_id=${quotation_id}`);
  }

  // Build pricing_variables array matching quotation_calulate.json shape
  const pricingVariables = pricingRows.map((p: any) => ({
    item_id: p.itemId,                                              // Item PK
    shipping_cost: p.shippingCost ? Number(p.shippingCost) : 0,     // Shipping cost
    tax_rate: p.taxRate ? Number(p.taxRate) : 0,                    // Tax rate
    exchange_rate: p.exchangeRate ? Number(p.exchangeRate) : 1.0,   // Exchange rate
    profit_rate: p.profitRate ? Number(p.profitRate) : 0,           // Profit rate
    discount_rate: p.discountRate ? Number(p.discountRate) : 0,     // Discount rate
  }));

  return {
    quotation_id,
    pricing_variables: pricingVariables, // Pricing variables array
  };
}

// =============================================
// respond_service BUILDERS
// =============================================

/**
 * respond_service + supplier_respond: Load from supplierItemStatus + incomingEmails.
 * Builds the exact JSON shape of respond_service.json (supplier case).
 * Sources: supplierItemStatus (items_source), incomingEmails (incoming_email)
 */
async function loadRespondSupplierInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, workspace } = params;
  if (!rfq_id) throw new Error('[data-loader] rfq_id required for respond_service/supplier_respond');

  // Fetch incoming email linked to this RFQ
  const emailRows = await getData('incomingEmails', { rfqId: rfq_id }, workspace);
  if (!emailRows.length) {
    throw new Error(`[data-loader] No incomingEmails found for rfq_id=${rfq_id}`);
  }
  const email = emailRows[0];

  // Fetch all supplier item statuses for this RFQ
  const itemRows = await getData('supplierItemStatus', { rfqId: rfq_id }, workspace);

  // Build items_source matching respond_service.json supplier case
  const itemsSource = itemRows.map((item: any) => ({
    item_id: item.itemId ?? 0,                             // FK to rfq_items
    supplier_id: item.supplierId ?? 0,                     // Supplier identifier
    supplier_name: item.supplierName ?? '',                // Supplier display name
    source_url: item.sourceUrl ?? '',                      // Where supplier was found
    status: item.status ?? 'pending',                      // Current status
    delivery_time: item.deliveryTime ?? '',                // Delivery estimate
    bidder_description: item.bidderDescription ?? '',      // Supplier's product description
    bidder_unit_price: item.bidderUnitPrice ? Number(item.bidderUnitPrice) : 0, // Unit price
    compliance_deviation: item.complianceDeviation ?? '',  // Compliance notes
    notes: item.notes ?? '',                               // Supplier notes
    contact_email: item.contactEmail ?? '',                // Supplier contact email
    contact_phone: item.contactPhone ?? '',                // Supplier contact phone
  }));

  return {
    rfq_id,
    incoming_email: {
      message_id: email.messageId ?? '',                   // Dedup ID
      from_email: email.fromEmail ?? '',                   // Sender email
      from_name: email.fromName ?? '',                     // Sender name
      to: email.toRecipients ?? [],                        // TO recipients
      cc: email.ccRecipients ?? [],                        // CC recipients
      subject: email.subject ?? '',                        // Subject line
      email_body_text: email.emailBodyText ?? '',          // Body text
      attachments_parsed: (email.attachmentsParsed ?? []) as Array<{ filename: string; content_type: string; extracted_text: string }>, // Parsed attachments
      received_at: email.receivedAt?.toISOString() ?? '',  // Timestamp
    },
    items_source: itemsSource,                             // Supplier items array
  } as Partial<ProcessorInput>;
}

/**
 * respond_service + customer_respond: Load from rfqItems + incomingEmails.
 * Builds the exact JSON shape of respond_service.json (customer case).
 * Sources: rfqItems (rfq_items), incomingEmails (incoming_email)
 */
async function loadRespondCustomerInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, workspace } = params;
  if (!rfq_id) throw new Error('[data-loader] rfq_id required for respond_service/customer_respond');

  // Fetch incoming email linked to this RFQ
  const emailRows = await getData('incomingEmails', { rfqId: rfq_id }, workspace);
  if (!emailRows.length) {
    throw new Error(`[data-loader] No incomingEmails found for rfq_id=${rfq_id}`);
  }
  const email = emailRows[0];

  // Fetch RFQ items + parent rfq_analysis (for required_currency)
  const [itemRows, analysisRows] = await Promise.all([
    getData('rfqItems', { rfqId: rfq_id }, workspace),
    getData('rfqAnalysis', { rfqId: rfq_id }, workspace),
  ]);
  // currency_code now lives on supplier_item_status. At the customer-respond
  // stage we fall back to rfq_analysis.required_currency.
  const requiredCurrency = String(analysisRows[0]?.requiredCurrency ?? 'USD');

  // Build rfq_items matching respond_service.json customer case
  const rfqItems = itemRows.map((item: any) => ({
    item_id: String(item.itemId),                         // String ID as per JSON sample
    currency_code: requiredCurrency,                      // Sourced from rfq_analysis.required_currency
    company_requirement: {
      company_description: item.companyDescription ?? '', // Item description
      qty: item.qty ? Number(item.qty) : 1,               // Quantity
      uom: item.uom ?? '',                                // Unit of measure
    },
  }));

  return {
    rfq_id,
    incoming_email: {
      message_id: email.messageId ?? '',                   // Dedup ID
      from_email: email.fromEmail ?? '',                   // Sender email
      from_name: email.fromName ?? '',                     // Sender name
      to: email.toRecipients ?? [],                        // TO recipients
      cc: email.ccRecipients ?? [],                        // CC recipients
      subject: email.subject ?? '',                        // Subject line
      email_body_text: email.emailBodyText ?? '',          // Body text
      attachments_parsed: (email.attachmentsParsed ?? []) as Array<{ filename: string; content_type: string; extracted_text: string }>, // Parsed attachments
      received_at: email.receivedAt?.toISOString() ?? '',  // Timestamp
    },
    rfq_items: rfqItems,                                   // RFQ items array
  } as Partial<ProcessorInput>;
}

// =============================================
// email BUILDERS
// =============================================

/**
 * email + generate: Load from incomingEmails for the related flow.
 * Builds the exact JSON shape of email-actions-json.json Input_1.
 * Source: incomingEmails (reference_content from email subject/body/attachments)
 */
async function loadEmailGenerateInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, workspace } = params;
  if (!rfq_id) throw new Error('[data-loader] rfq_id required for email/generate');

  // Fetch incoming email linked to this RFQ for reference content
  const emailRows = await getData('incomingEmails', { rfqId: rfq_id }, workspace);

  // Build reference_content from incoming email (subject + body + attachments summary)
  let referenceContent = '';
  if (emailRows.length) {
    const email = emailRows[0];
    const parts = [
      email.subject ?? '',                   // Email subject
      email.emailBodyText ?? '',             // Email body text
    ];
    // Append attachment extracted text if available
    const attachments = email.attachmentsParsed as Array<{ extracted_text?: string }> | null;
    if (attachments?.length) {
      parts.push(attachments.map((a) => a.extracted_text ?? '').join('\n'));
    }
    referenceContent = parts.filter(Boolean).join('\n\n'); // Combine all parts
  }

  return {
    rfq_id,
    reference_content: referenceContent,  // Combined email content for AI reference
    instructions: '',                      // Optional — AI or human fills this
  } as Partial<ProcessorInput>;
}

/**
 * email + regenerate: Load from emailTable for previous email content.
 * Builds the exact JSON shape of email-actions-json.json Input_2.
 * Source: emailTable (by email_id or rfq_id)
 */
async function loadEmailRegenerateInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, email_id, workspace } = params;

  // Fetch previous email (prefer email_id, fallback to rfq_id)
  let emailRows: any[];
  if (email_id) {
    emailRows = await getData('emailTable', { emailId: email_id }, workspace);
  } else if (rfq_id) {
    emailRows = await getData('emailTable', { rfqId: rfq_id }, workspace);
  } else {
    throw new Error('[data-loader] email_id or rfq_id required for email/re_generate');
  }

  if (!emailRows.length) {
    throw new Error(`[data-loader] No email found for email_id=${email_id}, rfq_id=${rfq_id}`);
  }
  const prevEmail = emailRows[0];

  return {
    rfq_id,
    previous_email: {
      subject: prevEmail.subject ?? '',          // Previous email subject
      email_content: prevEmail.emailContent ?? '', // Previous email body content
    },
  } as Partial<ProcessorInput>;
}

/**
 * email + send: Load draft content from email_table + all contact emails from supplier_item_status.
 * Provides the populated `email` field (first supplier) and full `items_source` list for multi-send.
 */
async function loadEmailSendInput(
  params: LoaderParams
): Promise<Partial<ProcessorInput>> {
  const { rfq_id, workspace } = params;
  if (!rfq_id) throw new Error('[data-loader] rfq_id required for email/send');

  // Fetch the draft email and all supplier contacts in parallel
  const [emailRows, supplierRows] = await Promise.all([
    getData('emailTable', { rfqId: rfq_id }, workspace),
    getData('supplierItemStatus', { rfqId: rfq_id }, workspace),
  ]);

  const draft = emailRows[0] as Record<string, unknown> | undefined;
  // Build items_source list so processEmail:send can loop over all recipients
  const itemsSource = (supplierRows as Array<Record<string, unknown>>)
    .filter(s => s.contactEmail)
    .map(s => ({
      contact_email: String(s.contactEmail ?? ''),
      supplier_name: String(s.supplierName ?? ''),
      rfq_id,
    }));

  // Populate `email` with draft content + first supplier as primary recipient
  return {
    rfq_id,
    email: {
      recipient_email: itemsSource[0]?.contact_email ?? '',
      subject:         String(draft?.subject        ?? ''),
      email_content:   String(draft?.emailContent   ?? ''),
      email_status:    'sent',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items_source: itemsSource as any,  // full list consumed by processEmail for multi-send
  } as unknown as Partial<ProcessorInput>;
}

// =============================================
// 2-LEVEL PAYLOAD LOADERS MAP
// =============================================
// Routes [data_type][action_type] -> dedicated builder function.
// Each builder loads specific DB tables and returns the exact JSON shape
// expected by the corresponding action processor.

const PAYLOAD_LOADERS: Record<string, Record<string, BuilderFn>> = {
  rfq_analysis: {
    analyze:   loadRfqAnalysisAnalyzeInput,    // incoming_emails -> rfq-analysis.json Input_1
    reanalyze: loadRfqAnalysisReanalyzeInput,  // rfqAnalysis + rfqItems -> Input_2
  },
  supplier_search: {
    search:   loadSupplierSearchSearchInput,   // rfqAnalysis -> supplier-search.json Input_1
    research: loadSupplierSearchResearchInput,  // supplierSearch + supplierItemStatus + rfqAnalysis -> Input_2
  },
  quotation: {
    generate:      loadQuotationGenerateInput,      // quotations + rfqItems + supplierItemStatus(ordered) + customers
    update:        loadQuotationGenerateInput,       // same shape as generate (uses quotation_id)
    manual_update: loadQuotationManualUpdateInput,   // quotationPricing + userCompany + supplierItemStatus + userInfo + customers + rfqItems + quotations
    calculate:     loadQuotationCalculateInput,       // quotationPricing -> quotation_calulate.json
  },
  respond_service: {
    supplier_respond: loadRespondSupplierInput,  // supplierItemStatus + incomingEmails
    customer_respond: loadRespondCustomerInput,  // rfqItems + incomingEmails
  },
  email: {
    generate:    loadEmailGenerateInput,     // incomingEmails flow -> email-actions-json Input_1
    re_generate: loadEmailRegenerateInput,   // emailTable -> email-actions-json Input_2
    send:        loadEmailSendInput,         // emailTable (draft) + supplierItemStatus (recipients)
  },
  // incoming_email is classified internally (no pipeline chain loads into it)
  incoming_email: {},
};

// =============================================
// MAIN ENTRY POINT
// =============================================

/**
 * Load data from the database and build a complete ProcessorInput
 * for the given data_type + action_type combination.
 *
 * @param params.data_type    - The target data type to build input for
 * @param params.action_type  - The specific action within that data type
 * @param params.workspace    - Workspace context for tenant isolation
 * @param params.rfq_id       - Optional RFQ ID (most flows)
 * @param params.quotation_id - Optional quotation ID (quotation flows)
 * @param params.email_id     - Optional email ID (email flows)
 * @param params.overrides    - Optional partial input to merge on top of DB data
 * @returns Complete ProcessorInput ready for data-processor routing
 * @throws Error if data_type/action_type is unsupported or DB queries fail
 */
export async function loadProcessorInput(
  params: LoaderParams
): Promise<ProcessorInput> {
  const { data_type, action_type, workspace, overrides } = params;

  // Validate that we have loaders for this data_type
  const actionLoaders = PAYLOAD_LOADERS[data_type];
  if (!actionLoaders) {
    throw new Error(
      `[data-loader] No loaders registered for data_type="${data_type}". ` +
      `Supported: ${Object.keys(PAYLOAD_LOADERS).join(', ')}`
    );
  }

  // Validate that we have a loader for this action_type
  const builder = actionLoaders[action_type];
  if (!builder) {
    throw new Error(
      `[data-loader] No loader for data_type="${data_type}", action_type="${action_type}". ` +
      `Supported actions: ${Object.keys(actionLoaders).join(', ')}`
    );
  }

  try {
    // Step 1: Load base data from the database via dedicated builder
    const dbData = await builder(params);

    // Step 2: Merge DB data with overrides (overrides take precedence)
    const merged: ProcessorInput = {
      data_type,
      action_type,
      ...dbData,
      ...overrides,
      workspace,
    } as ProcessorInput;

    return merged;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `[data-loader] Failed to load input for data_type="${data_type}", ` +
      `action_type="${action_type}": ${message}`
    );
  }
}
