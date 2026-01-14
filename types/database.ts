// =============================================
// 📋 DATABASE TYPE DEFINITIONS
// =============================================
// Purpose: Centralized TypeScript types for database operations

import type {
  Quotation,
  QuotationItem,
  QuotationPricing,
  Customer,
  Email,
  RfqAnalysis,
  SupplierSearch,
  FileMetadata,
  UserSession,
  ClientCompany,
  ClientInfo,
} from '@/lib/db/schema';

// Re-export schema types for convenience
export type {
  Quotation,
  QuotationItem,
  QuotationPricing,
  Customer,
  Email,
  RfqAnalysis,
  SupplierSearch,
  FileMetadata,
  UserSession,
  ClientCompany,
  ClientInfo,
};

/**
 * DatabaseResult - Generic result wrapper for database operations
 * Provides consistent response structure across all DB operations
 */
export interface DatabaseResult<T> {
  success: boolean;         // Operation success status
  data?: T;                 // Returned data (if successful)
  error?: string;           // Error message (if failed)
  timestamp: string;        // Operation timestamp
}

/**
 * WorkspaceFilter - Tenant filtering criteria
 * Used for automatic workspace isolation in queries
 */
export interface WorkspaceFilter {
  company_id: number;       // Always required for tenant isolation
  client_id?: number;       // Optional, included when client isolation enabled
}

/**
 * QueryOptions - Common query parameters
 * Used for pagination and sorting
 */
export interface QueryOptions {
  limit?: number;           // Maximum number of records to return
  offset?: number;          // Number of records to skip (for pagination)
  orderBy?: string;         // Column name to sort by
}
