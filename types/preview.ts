// =============================================
// PREVIEW TYPES - Type definitions for preview panel
// =============================================

import type { DataType } from '@/lib/utils/validator';
import type { WorkflowStep, WorkflowStepId } from '@/types/workflow';

// ---------------------------------------------
// Seller Info (from CLIENT_COMPANY table)
// ---------------------------------------------

export interface SellerInfo {
  company_name: string;
  address: string;
  tel: string;
  phone: string;
  fax_number: string;
  email: string;
  logo_url: string | null;       // base64 data URL or asset URL
  signature_url: string | null;  // base64 data URL or asset URL
}

// ---------------------------------------------
// Customer Info
// ---------------------------------------------

export interface CustomerInfo {
  company_name: string;
  attention_person: string;
  carbon_copy_person: string[];
  email: string;
  tel: string;
  phone: string;
  fax_number: string;
  customer_address: string;
}

// ---------------------------------------------
// Quotation Item (matches default-template.html columns)
// ---------------------------------------------

export interface PreviewQuotationItem {
  item_id: number;
  company_requirement: {
    company_description: string;
    qty: number;
    uom: string;
  };
  bidder_proposal: {
    bidder_description: string;
    delivery_time: string;
    compliance_deviation: string;
  };
  sales_unit_price: number;
  ext_price: number;
}

// ---------------------------------------------
// Quotation Document Data (all fields from default-template.html)
// ---------------------------------------------

export interface QuotationDocumentData {
  // Document metadata
  quotation_id: number | null;
  quotation_name: string;
  quotation_date: string;
  page_number: string;
  rfq_reference: string;

  // Parties
  seller_info: SellerInfo;
  customer_info: CustomerInfo;

  // Items table (8 columns matching template)
  quotation_items: PreviewQuotationItem[];

  // Totals
  total_amount: number;

  // Footer
  commercial_terms: string;
}

// ---------------------------------------------
// Email Document Data
// ---------------------------------------------

export interface EmailDocumentData {
  email_id: number | null;
  subject: string;
  email_content: string;
  recipient_email: string;
}

// ---------------------------------------------
// RFQ Analysis Document Data
// ---------------------------------------------

export interface RfqAnalysisDocumentData {
  rfq_id: number | null;
  subject: string;
  analysis_content: string;
  rfq_items: Array<{           // extracted RFQ line items for display in analysis panel
    item_id: number;
    company_description: string;
    qty: number;
    uom: string;
    currency_code: string;
  }>;
}

// ---------------------------------------------
// Supplier Search Document Data
// ---------------------------------------------

export interface SupplierSearchDocumentData {
  search_id: number | null;
  rfq_id: number | null;       // required for proceed pipeline (Accept button)
  subject: string;
  search_content: string;
  items_source: Array<{        // Supplier items for Items Source Summary display
    item_id: number;
    supplier_name: string;
    bidder_description: string;
    bidder_unit_price: number;
    delivery_time: string;
    contact_email: string;
    contact_phone: string;
    source_url: string;
    status: string;
  }>;
}

// Thread message (outbound sent email or inbound supplier reply)
export interface ThreadMessage {
  direction: 'outbound' | 'inbound';
  subject: string;
  body: string;
  from_email: string;
  sent_at: string | null;
}

// Per-supplier row within an items_ordering item group
export interface ItemsOrderingSupplier {
  supplier_id: number | null;
  supplier_name: string;
  unit_price: number | null;        // bidder_unit_price from supplier_item_status
  lead_time: string | null;         // delivery_time from supplier_item_status
  status: 'sent' | 'quoted' | 'awarded' | 'declined';
  contact_email: string | null;
  responded_at: string | null;
  source_url: string | null;
  ai_summary: string | null;        // AI-generated thread summary for lower panel
  thread: ThreadMessage[];          // full conversation for this supplier-item pair
}

// Per-item group row in the items_ordering split panel table
export interface ItemsOrderingItem {
  item_id: number;
  item_name: string;                // company_description from rfq_items
  rfq_qty: number;
  uom: string;
  currency_code: string;
  suppliers: ItemsOrderingSupplier[];
}

// Document data for the items_ordering stage split-panel UI
export interface ItemsOrderingDocumentData {
  rfq_id: number | null;
  rfq_reference: string;
  items: ItemsOrderingItem[];
  summary: {
    total_items: number;
    quoted_count: number;    // items with at least one quoted/awarded supplier
    awarded_count: number;   // items with an awarded supplier
    declined_count: number;  // items where all suppliers declined
    awaiting_count: number;  // items where all suppliers are still 'sent'
  };
}

// ---------------------------------------------
// Union type for all document data
// ---------------------------------------------

export type DocumentData =
  | { type: 'quotation'; data: QuotationDocumentData }
  | { type: 'email'; data: EmailDocumentData }
  | { type: 'rfq_analysis'; data: RfqAnalysisDocumentData }
  | { type: 'supplier_search'; data: SupplierSearchDocumentData }
  | { type: 'items_ordering'; data: ItemsOrderingDocumentData };

// ---------------------------------------------
// Preview Panel State (with undo/redo)
// ---------------------------------------------

export interface PreviewState {
  activeDocument: DocumentData | null;  // Currently displayed document
  isEditing: boolean;                   // Edit mode toggle
  history: DocumentData[];              // Past states (for undo)
  future: DocumentData[];               // Undone states (for redo)
  isLoading: boolean;
  error: string | null;
}

// ---------------------------------------------
// Preview Reducer Actions
// ---------------------------------------------

export type PreviewAction =
  | { type: 'LOAD_DOCUMENT'; payload: DocumentData }
  | { type: 'UPDATE_FIELD'; path: string; value: unknown }
  | { type: 'TOGGLE_EDIT' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'CLEAR' };

// ---------------------------------------------
// Workboard Snapshot Types (Layer 2 versioning)
// ---------------------------------------------

/** Pricing data included in a snapshot */
export interface PricingSnapshotData {
  quotation_id: number | null;
  items: Array<Record<string, unknown>>;
  total_amount: number;
  currency: string;
}

/** Full panels state captured in a snapshot */
export interface PanelsSnapshot {
  preview: DocumentData | null;
  pricing: PricingSnapshotData | null;
}

/** A workboard snapshot record (maps to DB row) */
export interface WorkboardSnapshotRecord {
  snapshot_id: number;
  rfq_id: number;
  version: number;
  triggered_by: WorkflowStepId;
  label: string | null;
  panels_snapshot: PanelsSnapshot;
  workflow_snapshot: WorkflowStep[];
  created_at: string;
}
