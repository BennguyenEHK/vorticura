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

/** Structured analysis output returned by AI model */
export interface AnalysisData {
  summary: string;         // Brief summary of the RFQ
  items: Array<{
    description: string;   // Item description
    quantity?: number;      // Requested quantity
    unit?: string;          // Unit of measure (pcs, sets, kg, etc.)
    specifications?: string; // Technical specs
  }>;
  customerInfo: {
    name: string;           // Contact person name
    email: string;          // Contact email
    company?: string;       // Company name
    phone?: string;         // Phone number
  };
  deadlines?: string[];           // Deadline dates (YYYY-MM-DD)
  specialRequirements?: string[]; // Special conditions
  confidence: number;             // 0.0 - 1.0 confidence score
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
