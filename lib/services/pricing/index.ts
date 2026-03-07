// =============================================
// PRICING SERVICES - Barrel exports
// =============================================
// Central export point for all pricing services

// Export validation utilities
export {
  validateVariableField,
  validatePricingVariable,
  validatePricingVariables,
  validateQuotationItem,
  validateQuotationItems,
  parseFormattedNumber,
  formatNumber,
  formatCurrency,
  type ValidationResult,
} from './validation';

// Export currency service
export {
  CurrencyService,
  currencyService,
} from './currency-service';

// Export pricing calculator
export {
  PricingCalculator,
  pricingCalculator,
} from './pricing-calculator';

// Export pricing manager server actions
export {
  getQuotationItems,
  loadPricingVariables,
  savePricingVariables,
  saveCalculatedPricing,
  loadPricingData,
  initializeVariables,
} from './pricing-manager';
