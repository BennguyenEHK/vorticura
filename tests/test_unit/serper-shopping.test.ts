import assert from 'assert';
import { parseShoppingPrice, parseShoppingItem } from '../../lib/services/search/serper-shopping.js';

console.log('Testing parseShoppingPrice...');
assert.deepStrictEqual(parseShoppingPrice('$49.99'), { price: 49.99, currency: 'USD' });
assert.deepStrictEqual(parseShoppingPrice('₫37,084'), { price: 37084, currency: 'VND' });
assert.deepStrictEqual(parseShoppingPrice('€12.50'), { price: 12.50, currency: 'EUR' });
assert.deepStrictEqual(parseShoppingPrice('AUD 89.50'), { price: 89.50, currency: 'AUD' });
assert.strictEqual(parseShoppingPrice(''), null);
assert.strictEqual(parseShoppingPrice('call for price'), null);
console.log('✓ parseShoppingPrice passed');

console.log('Testing parseShoppingItem...');
const item = parseShoppingItem({ title: 'M8 Hex Nut', source: 'Bolt Depot', link: 'https://google.com/shopping/redirect', price: '$2.99' });
assert(item !== null);
assert.strictEqual(item!.source, 'Bolt Depot');
assert.strictEqual(item!.price, 2.99);
assert.strictEqual(item!.currency, 'USD');
assert.strictEqual(parseShoppingItem({ title: 'X', source: 'Y', link: 'Z', price: '' }), null);
console.log('✓ parseShoppingItem passed');

console.log('✓ serper-shopping.test passed');
