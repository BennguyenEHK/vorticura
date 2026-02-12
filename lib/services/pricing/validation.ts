// =============================================
// PRICING VALIDATION - Input validation utilities
// =============================================
// Validates pricing variables and quotation items
// Ensures data integrity before calculations

import type { PricingVariable, QuotationItem } from '@/types/pricing';

// ---------------------------------------------
// Validation Result Type
// ---------------------------------------------

/** Validation result with optional error message */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// ---------------------------------------------
// Variable Validation
// ---------------------------------------------

/**
 * Validate a single pricing variable field value
 * @param field - Field name being validated
 * @param value - Value to validate
 * @returns ValidationResult with isValid flag and optional error
 */
export function validateVariableField(
  field: keyof Omit<PricingVariable, 'item_id'>,
  value: number
): ValidationResult {
  // Check for NaN or undefined
  if (value === undefined || value === null || isNaN(value)) {
    return { isValid: false, error: `${field} must be a valid number` };
  }

  // Field-specific validation rules
  switch (field) {
    case 'shipping_cost':
      // Shipping cost must be non-negative
      if (value < 0) {
        return { isValid: false, error: 'Shipping cost cannot be negative' };
      }
      break;

    case 'tax_rate':
      // Tax rate must be positive (1.0 = no tax, 1.1 = 10% tax)
      if (value < 0) {
        return { isValid: false, error: 'Tax rate cannot be negative' };
      }
      if (value > 10) {
        return { isValid: false, error: 'Tax rate seems too high (>1000%)' };
      }
      break;

    case 'exchange_rate':
      // Exchange rate must be positive
      if (value <= 0) {
        return { isValid: false, error: 'Exchange rate must be greater than 0' };
      }
      break;

    case 'profit_rate':
      // Profit rate must be positive (1.0 = no profit, 1.25 = 25% profit)
      if (value < 0) {
        return { isValid: false, error: 'Profit rate cannot be negative' };
      }
      if (value > 10) {
        return { isValid: false, error: 'Profit rate seems too high (>1000%)' };
      }
      break;

    case 'discount_rate':
      // Discount rate is a decimal (0.05 = 5% discount)
      if (value < 0) {
        return { isValid: false, error: 'Discount rate cannot be negative' };
      }
      if (value > 1) {
        return { isValid: false, error: 'Discount rate cannot exceed 100%' };
      }
      break;
  }

  return { isValid: true };
}

/**
 * Validate a complete pricing variable object
 * @param variable - PricingVariable to validate
 * @returns ValidationResult with isValid flag and optional error
 */
export function validatePricingVariable(variable: PricingVariable): ValidationResult {
  // Check item_id exists and is valid
  if (!variable.item_id || variable.item_id <= 0) {
    return { isValid: false, error: 'Invalid item_id' };
  }

  // Validate each field
  const fields: Array<keyof Omit<PricingVariable, 'item_id'>> = [
    'shipping_cost',
    'tax_rate',
    'exchange_rate',
    'profit_rate',
    'discount_rate',
  ];

  for (const field of fields) {
    const result = validateVariableField(field, variable[field]);
    if (!result.isValid) {
      return { isValid: false, error: `Item ${variable.item_id}: ${result.error}` };
    }
  }

  return { isValid: true };
}

/**
 * Validate an array of pricing variables
 * @param variables - Array of PricingVariable to validate
 * @returns ValidationResult with isValid flag and optional error
 */
export function validatePricingVariables(variables: PricingVariable[]): ValidationResult {
  if (!variables || !Array.isArray(variables)) {
    return { isValid: false, error: 'Pricing variables must be an array' };
  }

  if (variables.length === 0) {
    return { isValid: false, error: 'At least one pricing variable is required' };
  }

  // Check for duplicate item_ids
  const itemIds = new Set<number>();
  for (const variable of variables) {
    if (itemIds.has(variable.item_id)) {
      return { isValid: false, error: `Duplicate item_id: ${variable.item_id}` };
    }
    itemIds.add(variable.item_id);

    // Validate each variable
    const result = validatePricingVariable(variable);
    if (!result.isValid) {
      return result;
    }
  }

  return { isValid: true };
}

// ---------------------------------------------
// Quotation Item Validation
// ---------------------------------------------

/**
 * Validate a quotation item for pricing calculation
 * @param item - QuotationItem to validate
 * @returns ValidationResult with isValid flag and optional error
 */
export function validateQuotationItem(item: QuotationItem): ValidationResult {
  // Check required fields
  if (!item.item_id || item.item_id <= 0) {
    return { isValid: false, error: 'Invalid item_id' };
  }

  if (item.bidder_unit_price === undefined || item.bidder_unit_price === null) {
    return { isValid: false, error: `Item ${item.item_id}: Missing bidder_unit_price` };
  }

  if (item.bidder_unit_price <= 0) {
    return { isValid: false, error: `Item ${item.item_id}: Unit price must be greater than 0` };
  }

  if (!item.qty || item.qty <= 0) {
    return { isValid: false, error: `Item ${item.item_id}: Quantity must be greater than 0` };
  }

  return { isValid: true };
}

/**
 * Validate an array of quotation items
 * @param items - Array of QuotationItem to validate
 * @returns ValidationResult with isValid flag and optional error
 */
export function validateQuotationItems(items: QuotationItem[]): ValidationResult {
  if (!items || !Array.isArray(items)) {
    return { isValid: false, error: 'Quotation items must be an array' };
  }

  if (items.length === 0) {
    return { isValid: false, error: 'At least one quotation item is required' };
  }

  for (const item of items) {
    const result = validateQuotationItem(item);
    if (!result.isValid) {
      return result;
    }
  }

  return { isValid: true };
}

// ---------------------------------------------
// Number Parsing & Formatting
// ---------------------------------------------

/**
 * Parse a formatted number string (handles commas, spaces, currency symbols)
 * @param value - String or number to parse
 * @returns Parsed number or null if invalid
 */
export function parseFormattedNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return isFinite(value) ? value : null;
  }

  // Remove formatting characters (commas, spaces, currency symbols)
  const cleaned = value.replace(/[,\s₫VND$€¥]/g, '');
  if (cleaned === '') return null;

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) || !isFinite(parsed) ? null : parsed;
}

/**
 * Format a number with thousand separators
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted string
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a number as currency (VND)
 * @param value - Number to format
 * @returns Formatted currency string
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
