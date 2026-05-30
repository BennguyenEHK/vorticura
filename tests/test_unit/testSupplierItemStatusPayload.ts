import assert from 'assert';
import { buildSupplierItemStatusPayload } from '@/lib/utils/databaseHandler';

// =============================================
// Regression: "9 items processed, only 3 saved"
// =============================================
// Confirmed root cause (Cause B): an LLM-authored field overflows its
// supplier_item_status column constraint, insertData() throws, and the
// non-isolated write loop abandons every row after the failing one — silently.
//
// The fix clamps each value to its column width/precision at the DB-write
// boundary so no row can throw a "value too long" / numeric-overflow error.
// Column widths mirror lib/db/schema.ts (supplierItemStatus):
//   currency_code  varchar(3)
//   supplier_name  varchar(255)
//   delivery_time  varchar(100)
//   contact_phone  varchar(50)
//   contact_email  varchar(255)
//   bidder_unit_price numeric(15,4)  → max 11 integer digits

// --- currency_code: the prime offender (HF schema-less path emits free text) ---
const longCcy = buildSupplierItemStatusPayload({ currency_code: 'US Dollar' });
assert.ok(
  String(longCcy.currencyCode).length <= 3,
  `currency_code must fit varchar(3); got "${longCcy.currencyCode}"`,
);

const lowerCcy = buildSupplierItemStatusPayload({ currency_code: 'usd' });
assert.equal(lowerCcy.currencyCode, 'USD', 'currency_code is upper-cased to ISO form');

const symbolCcy = buildSupplierItemStatusPayload({ currency_code: 'US$' });
assert.ok(
  String(symbolCcy.currencyCode).length <= 3,
  `currency_code with symbols must still fit varchar(3); got "${symbolCcy.currencyCode}"`,
);

// --- supplier_name: varchar(255) ---
const longName = buildSupplierItemStatusPayload({ supplier_name: 'X'.repeat(300) });
assert.ok(
  String(longName.supplierName).length <= 255,
  `supplier_name must fit varchar(255); got length ${String(longName.supplierName).length}`,
);

// --- delivery_time: varchar(100) ---
const longDelivery = buildSupplierItemStatusPayload({ delivery_time: 'D'.repeat(200) });
assert.ok(
  String(longDelivery.deliveryTime).length <= 100,
  `delivery_time must fit varchar(100); got length ${String(longDelivery.deliveryTime).length}`,
);

// --- contact_phone: varchar(50) ---
const longPhone = buildSupplierItemStatusPayload({ contact_phone: '+84 '.repeat(30) });
assert.ok(
  String(longPhone.contactPhone).length <= 50,
  `contact_phone must fit varchar(50); got length ${String(longPhone.contactPhone).length}`,
);

// --- contact_email: varchar(255) ---
const longEmail = buildSupplierItemStatusPayload({ contact_email: 'a'.repeat(300) + '@x.com' });
assert.ok(
  String(longEmail.contactEmail).length <= 255,
  `contact_email must fit varchar(255); got length ${String(longEmail.contactEmail).length}`,
);

// --- bidder_unit_price: numeric(15,4) → integer part must be < 1e11 ---
const hugePrice = buildSupplierItemStatusPayload({ bidder_unit_price: 1e20 });
assert.ok(
  Math.abs(Number(hugePrice.bidderUnitPrice)) < 1e11,
  `bidder_unit_price must fit numeric(15,4); got "${hugePrice.bidderUnitPrice}"`,
);

// --- Sanity: normal values pass through unchanged ---
const ok = buildSupplierItemStatusPayload({
  currency_code: 'EUR',
  supplier_name: 'Bao Vi Trading',
  delivery_time: '4-6 weeks',
  contact_phone: '+84 28 1234 5678',
  bidder_unit_price: 42.5,
});
assert.equal(ok.currencyCode, 'EUR', 'valid currency unchanged');
assert.equal(ok.supplierName, 'Bao Vi Trading', 'valid name unchanged');
assert.equal(ok.deliveryTime, '4-6 weeks', 'valid delivery unchanged');
assert.equal(ok.contactPhone, '+84 28 1234 5678', 'valid phone unchanged');
assert.equal(ok.bidderUnitPrice, '42.5', 'valid price unchanged');

console.log('✓ testSupplierItemStatusPayload passed');
