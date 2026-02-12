// =============================================
// PRICING TYPES - Type definitions for pricing panel
// =============================================
// Defines all TypeScript interfaces for:
// - Currency codes and quotation items
// - Pricing variables and calculated results
// - API request/response structures

// ---------------------------------------------
// Currency Types
// ---------------------------------------------

/** Supported currency codes */
export type Currency = 'VND' | 'USD' | 'EUR' | 'JPY';

/** Currency display info for UI */
export interface CurrencyInfo {
  code: Currency;
  symbol: string;
  name: string;
}

/** Available currencies with metadata */
export const CURRENCIES: CurrencyInfo[] = [
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
];

// ---------------------------------------------
// Quotation Item Types
// ---------------------------------------------

/** Quotation item from database */
export interface QuotationItem {
  item_id: number;                    // Unique item identifier
  bidder_description: string;         // Item description from bidder
  qty: number;                        // Quantity required
  currency_code: Currency;            // Original currency of the item
  bidder_unit_price: number;          // Unit price from bidder proposal
}

// ---------------------------------------------
// Pricing Variable Types
// ---------------------------------------------

/** Pricing variables per item - user configurable */
export interface PricingVariable {
  item_id: number;                    // Links to QuotationItem.item_id
  shipping_cost: number;              // Shipping cost per unit (e.g., 50000 VND)
  tax_rate: number;                   // Tax multiplier (e.g., 1.1 = 10% tax)
  exchange_rate: number;              // Exchange rate (e.g., 24000 for USD→VND)
  profit_rate: number;                // Profit multiplier (e.g., 1.25 = 25% profit)
  discount_rate: number;              // Discount as decimal (e.g., 0.05 = 5% off)
}

/** Default pricing variable values */
export const DEFAULT_PRICING_VARIABLES: Omit<PricingVariable, 'item_id'> = {
  shipping_cost: 0,
  tax_rate: 1.1,        // 10% tax
  exchange_rate: 1.0,   // No conversion (same currency)
  profit_rate: 1.25,    // 25% profit margin
  discount_rate: 0,     // No discount
};

/** Variable field metadata for UI rendering */
export interface VariableFieldConfig {
  key: keyof Omit<PricingVariable, 'item_id'>;
  label: string;
  hint: string;
  min: number;
  step: number;
  format: 'currency' | 'rate' | 'percent';
}

/** Configuration for all variable input fields */
export const VARIABLE_FIELDS: VariableFieldConfig[] = [
  {
    key: 'shipping_cost',
    label: 'Shipping Cost',
    hint: 'e.g., 50000 for 50,000 VND',
    min: 0,
    step: 1000,
    format: 'currency',
  },
  {
    key: 'tax_rate',
    label: 'Tax Rate',
    hint: 'e.g., 1.1 for 10% tax',
    min: 0,
    step: 0.01,
    format: 'rate',
  },
  {
    key: 'exchange_rate',
    label: 'Exchange Rate',
    hint: 'e.g., 24000 for USD→VND',
    min: 0,
    step: 0.1,
    format: 'currency',
  },
  {
    key: 'profit_rate',
    label: 'Profit Rate',
    hint: 'e.g., 1.2 for 20% profit',
    min: 0,
    step: 0.05,
    format: 'rate',
  },
  {
    key: 'discount_rate',
    label: 'Discount %',
    hint: 'e.g., 5 for 5% off',
    min: 0,
    step: 0.5,
    format: 'percent',
  },
];

// ---------------------------------------------
// Calculated Pricing Types
// ---------------------------------------------

/** Calculated pricing result per item */
export interface CalculatedPricing {
  item_id: number;                    // Links to QuotationItem.item_id
  sales_unit_price: number;           // Final unit price after all calculations
  ext_price: number;                  // Extended price (sales_unit_price × qty)
  potential_profit: number;           // Profit amount for this item
  calculation_timestamp: string;      // ISO timestamp of calculation
}

/** Combined item with its pricing data */
export interface ItemWithPricing {
  item: QuotationItem;
  variables: PricingVariable;
  calculated?: CalculatedPricing;
}

// ---------------------------------------------
// API Request/Response Types
// ---------------------------------------------

/** Request body for calculating pricing */
export interface CalculatePricingRequest {
  quotation_id: number;
  pricing_variables: PricingVariable[];
}

/** Response from pricing calculation API */
export interface CalculatePricingResponse {
  calculation_success: boolean;
  total_items: number;
  calculated_pricing: CalculatedPricing[];
  total_amount: number;
  total_profit: number;
  errors?: PricingError[];
}

/** Error object for failed item calculations */
export interface PricingError {
  item_id: number;
  error: string;
}

/** Request for updating pricing variables */
export interface UpdateVariablesRequest {
  quotation_id: number;
  variables: PricingVariable[];
}

/** Response from variables update API */
export interface UpdateVariablesResponse {
  success: boolean;
  updated_count: number;
}

/** Response from loading pricing data */
export interface LoadPricingResponse {
  quotation_id: number;
  items: QuotationItem[];
  variables: PricingVariable[];
  calculated_pricing: CalculatedPricing[];
}

// ---------------------------------------------
// Provider State Types
// ---------------------------------------------

/** Pricing panel context state */
export interface PricingPanelState {
  quotationId: number | null;         // Current quotation being edited
  items: QuotationItem[];             // Quotation items with prices
  variables: PricingVariable[];       // Per-item pricing variables
  calculatedPricing: CalculatedPricing[]; // Calculation results
  targetCurrency: Currency;           // User's selected target currency
  isLoading: boolean;                 // Data loading state
  isCalculating: boolean;             // Calculation in progress
  searchTerm: string;                 // Item search filter
  error: string | null;               // Error message if any
}

/** Pricing panel context actions */
export interface PricingPanelActions {
  loadQuotationData: (quotationId: number) => Promise<void>;
  updateVariable: (itemId: number, field: keyof Omit<PricingVariable, 'item_id'>, value: number) => void;
  bulkUpdateVariable: (itemIds: number[], field: keyof Omit<PricingVariable, 'item_id'>, value: number) => void;
  setTargetCurrency: (currency: Currency) => void;
  setSearchTerm: (term: string) => void;
  applyPricing: () => Promise<void>;
  resetVariables: () => void;
}

/** Combined context type */
export interface PricingPanelContextType extends PricingPanelState, PricingPanelActions {}

// ---------------------------------------------
// Bulk Update Types
// ---------------------------------------------

/** Bulk update popover state */
export interface BulkUpdateState {
  isOpen: boolean;
  field: keyof Omit<PricingVariable, 'item_id'> | null;
  selectedItemIds: number[];
  value: string;
  anchorPosition: { x: number; y: number } | null;
}

/** Bulk update action */
export interface BulkUpdateAction {
  field: keyof Omit<PricingVariable, 'item_id'>;
  itemIds: number[];
  value: number;
}
