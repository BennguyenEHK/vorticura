// =============================================
// CURRENCY SERVICE - Exchange rate management
// =============================================
// Handles currency conversions and exchange rates
// Persists user's target currency preference

import type { Currency } from '@/types/pricing';

// ---------------------------------------------
// Exchange Rate Configuration
// ---------------------------------------------

/** Predefined exchange rates (base: VND) */
const EXCHANGE_RATES: Record<string, number> = {
  // To VND conversions
  'USD_VND': 24000,    // 1 USD = 24,000 VND
  'EUR_VND': 26000,    // 1 EUR = 26,000 VND
  'JPY_VND': 160,      // 1 JPY = 160 VND
  'VND_VND': 1,        // Same currency

  // From VND conversions
  'VND_USD': 1 / 24000,
  'VND_EUR': 1 / 26000,
  'VND_JPY': 1 / 160,

  // Cross rates
  'USD_EUR': 0.92,
  'EUR_USD': 1.08,
  'USD_JPY': 150,
  'JPY_USD': 1 / 150,
  'EUR_JPY': 163,
  'JPY_EUR': 1 / 163,
};

// ---------------------------------------------
// Local Storage Key
// ---------------------------------------------

const TARGET_CURRENCY_KEY = 'pricing_target_currency';

// ---------------------------------------------
// Currency Service Class
// ---------------------------------------------

/**
 * CurrencyService - Manages exchange rates and currency preferences
 */
export class CurrencyService {
  private availableCurrencies: Set<Currency> = new Set();

  /**
   * Get exchange rate between two currencies
   * @param from - Source currency code
   * @param to - Target currency code
   * @returns Exchange rate multiplier
   */
  getExchangeRate(from: Currency, to: Currency): number {
    // Same currency = no conversion needed
    if (from === to) {
      return 1.0;
    }

    // Look up predefined rate
    const rateKey = `${from}_${to}`;
    const rate = EXCHANGE_RATES[rateKey];

    if (rate !== undefined) {
      return rate;
    }

    // Try reverse lookup
    const reverseKey = `${to}_${from}`;
    const reverseRate = EXCHANGE_RATES[reverseKey];

    if (reverseRate !== undefined) {
      return 1 / reverseRate;
    }

    // Unknown currency pair - default to 1.0 to prevent inflation
    console.warn(`Unknown currency pair: ${from} → ${to}, using 1.0`);
    return 1.0;
  }

  /**
   * Get a reasonable exchange rate based on currency pair
   * Uses heuristics to auto-detect appropriate rate
   * @param fromCurrency - Source currency code (string)
   * @param toCurrency - Target currency code (string)
   * @returns Reasonable exchange rate
   */
  getReasonableRate(fromCurrency: string, toCurrency: string): number {
    // Normalize currency codes
    const from = fromCurrency.toUpperCase() as Currency;
    const to = toCurrency.toUpperCase() as Currency;

    return this.getExchangeRate(from, to);
  }

  /**
   * Auto-detect target currency based on exchange rate value
   * @param exchangeRate - Exchange rate value
   * @returns Detected currency code
   */
  detectCurrencyFromRate(exchangeRate: number): Currency {
    if (exchangeRate > 10000) {
      return 'VND'; // Likely converting to VND
    } else if (exchangeRate > 100) {
      return 'JPY'; // Likely JPY
    } else if (exchangeRate < 2) {
      return 'USD'; // Likely USD or EUR
    }
    return 'VND'; // Default
  }

  /**
   * Set available currencies extracted from quotation items
   * @param currencies - Array of currency codes
   */
  setAvailableCurrencies(currencies: Currency[]): void {
    this.availableCurrencies = new Set(currencies);
  }

  /**
   * Get all available currencies from current quotation
   * @returns Array of currency codes
   */
  getAvailableCurrencies(): Currency[] {
    return Array.from(this.availableCurrencies);
  }

  /**
   * Save target currency preference to localStorage
   * @param currency - Currency code to save
   */
  saveTargetCurrency(currency: Currency): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(TARGET_CURRENCY_KEY, currency);
      }
    } catch (error) {
      console.error('Failed to save target currency:', error);
    }
  }

  /**
   * Load target currency preference from localStorage
   * @returns Saved currency code or 'VND' as default
   */
  loadTargetCurrency(): Currency {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(TARGET_CURRENCY_KEY);
        if (saved && ['VND', 'USD', 'EUR', 'JPY'].includes(saved)) {
          return saved as Currency;
        }
      }
    } catch (error) {
      console.error('Failed to load target currency:', error);
    }
    return 'VND'; // Default
  }

  /**
   * Format amount with currency symbol
   * @param amount - Number to format
   * @param currency - Currency code
   * @returns Formatted string with currency symbol
   */
  formatWithCurrency(amount: number, currency: Currency): string {
    const formatOptions: Intl.NumberFormatOptions = {
      minimumFractionDigits: 0,
      maximumFractionDigits: currency === 'VND' || currency === 'JPY' ? 0 : 2,
    };

    const formatted = new Intl.NumberFormat('vi-VN', formatOptions).format(amount);

    // Add currency symbol
    switch (currency) {
      case 'VND':
        return `${formatted} ₫`;
      case 'USD':
        return `$${formatted}`;
      case 'EUR':
        return `€${formatted}`;
      case 'JPY':
        return `¥${formatted}`;
      default:
        return formatted;
    }
  }

  /**
   * Get currency symbol
   * @param currency - Currency code
   * @returns Currency symbol
   */
  getCurrencySymbol(currency: Currency): string {
    switch (currency) {
      case 'VND': return '₫';
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'JPY': return '¥';
      default: return '';
    }
  }
}

// ---------------------------------------------
// Singleton Instance
// ---------------------------------------------

/** Shared currency service instance */
export const currencyService = new CurrencyService();
