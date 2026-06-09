import { describe, it, expect } from 'vitest';
import { parseShoppingPrice, parseShoppingItem } from '@/lib/services/search/serper-shopping';

describe('parseShoppingPrice', () => {
  it('parses USD dollar sign', () => {
    expect(parseShoppingPrice('$49.99')).toEqual({ price: 49.99, currency: 'USD' });
  });
  it('parses Vietnamese dong', () => {
    expect(parseShoppingPrice('₫37,084')).toEqual({ price: 37084, currency: 'VND' });
  });
  it('parses EUR', () => {
    expect(parseShoppingPrice('€12.50')).toEqual({ price: 12.50, currency: 'EUR' });
  });
  it('parses ISO prefix', () => {
    expect(parseShoppingPrice('AUD 89.50')).toEqual({ price: 89.50, currency: 'AUD' });
  });
  it('returns null for empty string', () => {
    expect(parseShoppingPrice('')).toBeNull();
  });
  it('returns null for non-numeric', () => {
    expect(parseShoppingPrice('call for price')).toBeNull();
  });
});

describe('parseShoppingItem', () => {
  it('maps a valid item', () => {
    const result = parseShoppingItem({
      title: 'M8 Hex Nut', source: 'Bolt Depot',
      link: 'https://google.com/shopping/redirect', price: '$2.99',
    });
    expect(result).toMatchObject({ source: 'Bolt Depot', price: 2.99, currency: 'USD' });
  });
  it('returns null when price is missing', () => {
    expect(parseShoppingItem({ title: 'X', source: 'Y', link: 'Z', price: '' })).toBeNull();
  });
});
