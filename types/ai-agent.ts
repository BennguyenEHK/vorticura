// =============================================
// AI AGENT TYPES - Shared types for local & remote AI inference
// =============================================
// Used by: lib/ai-agent/local-model.ts, lib/actions/analysis-actions.ts,
//          lib/actions/supplier-search-actions.ts

// Action type unions
type AnalysisActionType = 'analyze' | 'reanalyze';
type SearchActionType = 'search' | 'research';

// ---------------------------------------------
// Analysis Types
// ---------------------------------------------

/** Input for AI RFQ analysis call (used by both local model & remote API) */
export interface AICallInput {
  subject: string;        // RFQ email subject line
  analysisContent: string; // Full email body + attachment text
  actionType: AnalysisActionType;      // 'analyze' | 'reanalyze'
}

/** AI-generated analysis output (reduced scope — deterministic fields extracted separately) */
export interface AnalysisData {
  rfq_analysis: {
    subject: string;           // "RFQ Analysis - [topic]"
    analysis_content: string;  // Summary of requirements, deadlines, clarifications
    analysis_status: string;   // "completed"
  };
  // AI extracts only unstructured fields that resist pattern matching
  customer_partial: {
    company_name: string;
    customer_address: string;
  };
}

/** Deterministic extraction output (from rfq-extractor.ts) */
export interface DeterministicData {
  rfq_reference: string | null;
  customer: {
    email: string;
    attention_person: string;
    carbon_copy_person: string[];
    phone: string;
    fax_number: string;
  };
  rfq_items: Array<{
    item_id: number;
    company_description: string;
    qty: number;
    uom: string;
  }>;
  required_currency: string;
  deadline_period: string | null;
  closing_time: string | null;
}

/** Merged output: deterministic + AI = complete RFQ data */
export interface MergedAnalysisData {
  rfq_analysis: {
    subject: string;
    analysis_content: string;
    analysis_status: string;
  };
  customer_info: {
    company_name: string;
    attention_person: string;
    carbon_copy_person: string[];
    email: string;
    phone: string;
    fax_number: string;
    customer_address: string;
  };
  rfq_items: Array<{
    item_id: number;
    company_requirement: {
      company_description: string;
      qty: number;
      uom: string;
    };
  }>;
  required_currency: string;
  deadline_period: string | null;
  closing_time: string | null;
  rfq_reference: string | null;
}

// ---------------------------------------------
// Supplier Search Types
// ---------------------------------------------

/** Input for AI supplier search call (used by both local model & remote API) */
export interface SearchAPIInput {
  subject: string;        // Search subject / RFQ title
  searchContent: string;  // Item descriptions + requirements
  actionType: SearchActionType;     // 'search' | 'research'
}

/** Single supplier result returned by AI model */
export interface SupplierResult {
  id: string;              // Supplier ID (e.g., 'SUP-001')
  name: string;            // Company name
  email: string;           // Contact email
  rating?: number;         // 0-5 rating
  specialties: string[];   // Product categories
  estimatedLeadTime?: number; // Days
  matchScore: number;      // 0.0 - 1.0 relevance score
}
