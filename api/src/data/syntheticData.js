'use strict';

/**
 * Synthetic data generator.
 *
 * IMPORTANT: Every value produced here is programmatically generated and fake.
 * No real personal data is used anywhere in this project. Values are shaped to
 * match common sensitive-information-type patterns (SSN, credit card, email,
 * phone) purely so that Microsoft Purview / Defender for Cloud sensitive-data
 * detection has realistic-looking patterns to classify during API security
 * posture scans.
 */

const FIRST_NAMES = ['Avery', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Quinn', 'Reese', 'Harper', 'Skyler'];
const LAST_NAMES = ['Contoso', 'Fabrikam', 'Northwind', 'Tailspin', 'Adatum', 'Relecloud', 'Woodgrove', 'Litware'];
const DOMAINS = ['contoso.com', 'fabrikam.com', 'northwind.example', 'tailspintoys.example'];
const STREETS = ['Main St', 'Oak Ave', 'Pine Rd', 'Cedar Blvd', 'Maple Dr', 'Lakeview Ct'];
const CITIES = ['Redmond', 'Austin', 'Denver', 'Boston', 'Seattle', 'Phoenix', 'Chicago'];
const CARD_BRANDS = ['4', '5', '37', '6011']; // Visa / Mastercard / Amex / Discover-ish prefixes (fake)

function pick(arr, seed) {
  return arr[seed % arr.length];
}

function pad(num, size) {
  return String(num).padStart(size, '0');
}

/** Deterministic-but-varied fake SSN: never uses real invalid/reserved ranges on purpose is not required since this is 100% synthetic. */
function fakeSsn(seed) {
  const area = pad((seed * 37 + 100) % 899 + 1, 3);
  const group = pad((seed * 13 + 10) % 99 + 1, 2);
  const serial = pad((seed * 7 + 1000) % 9999 + 1, 4);
  return `${area}-${group}-${serial}`;
}

function fakeCreditCard(seed) {
  const prefix = pick(CARD_BRANDS, seed);
  let digits = prefix;
  let n = seed * 104729 + 123456789;
  while (digits.length < 16) {
    n = (n * 9301 + 49297) % 233280;
    digits += String(n % 10);
  }
  digits = digits.slice(0, 16);
  return digits.match(/.{1,4}/g).join(' ');
}

function fakeEmail(first, last, seed) {
  return `${first}.${last}${seed}@${pick(DOMAINS, seed)}`.toLowerCase();
}

function fakePhone(seed) {
  const area = pad((seed * 3 + 200) % 799 + 200, 3);
  const mid = pad((seed * 11) % 899 + 100, 3);
  const last = pad((seed * 17) % 9999, 4);
  return `+1-${area}-${mid}-${last}`;
}

function fakeAddress(seed) {
  return {
    street: `${100 + (seed % 900)} ${pick(STREETS, seed)}`,
    city: pick(CITIES, seed),
    state: pick(['WA', 'TX', 'CO', 'MA', 'AZ', 'IL'], seed),
    zip: pad((seed * 29) % 99999, 5),
  };
}

function generateCustomer(id) {
  const first = pick(FIRST_NAMES, id);
  const last = pick(LAST_NAMES, id * 3 + 1);
  return {
    id,
    firstName: first,
    lastName: last,
    email: fakeEmail(first, last, id),
    phone: fakePhone(id),
    ssn: fakeSsn(id),
    dateOfBirth: `19${60 + (id % 40)}-${pad((id % 12) + 1, 2)}-${pad((id % 28) + 1, 2)}`,
    address: fakeAddress(id),
    paymentMethods: [
      {
        type: 'credit_card',
        cardholderName: `${first} ${last}`,
        cardNumber: fakeCreditCard(id),
        expiry: `${pad((id % 12) + 1, 2)}/${28 + (id % 5)}`,
        cvv: pad((id * 7) % 999, 3),
      },
    ],
    notes: `Loyalty tier ${['Bronze', 'Silver', 'Gold', 'Platinum'][id % 4]}. Synthetic record for demo purposes only.`,
  };
}

const CUSTOMER_COUNT = 500;
const customers = Array.from({ length: CUSTOMER_COUNT }, (_, i) => generateCustomer(i + 1));

const PRODUCT_CATEGORIES = ['Electronics', 'Outdoors', 'Home', 'Toys', 'Office', 'Apparel'];

function generateProduct(id) {
  return {
    id,
    sku: `SKU-${pad(id, 6)}`,
    name: `Synthetic Product ${id}`,
    category: pick(PRODUCT_CATEGORIES, id),
    price: Number(((id % 500) + 9.99).toFixed(2)),
    stock: (id * 37) % 1000,
  };
}

const PRODUCT_COUNT = 1000;
const products = Array.from({ length: PRODUCT_COUNT }, (_, i) => generateProduct(i + 1));

function generateOrder(id) {
  const customer = customers[id % customers.length];
  const product = products[(id * 13) % products.length];
  return {
    id,
    orderNumber: `ORD-${pad(id, 8)}`,
    customerId: customer.id,
    customerEmail: customer.email,
    shippingAddress: customer.address,
    paymentLast4: customer.paymentMethods[0].cardNumber.slice(-4),
    lineItems: [
      { productId: product.id, sku: product.sku, qty: (id % 5) + 1, price: product.price },
    ],
    total: Number((product.price * ((id % 5) + 1)).toFixed(2)),
    status: pick(['pending', 'processing', 'shipped', 'delivered', 'cancelled'], id),
    createdAt: new Date(Date.now() - (id % 10000) * 60000).toISOString(),
  };
}

const ORDER_COUNT = 800;
const orders = Array.from({ length: ORDER_COUNT }, (_, i) => generateOrder(i + 1));

const adminUsers = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  username: `admin${i + 1}`,
  email: fakeEmail('admin', `user${i + 1}`, i + 1),
  role: i === 0 ? 'superadmin' : 'admin',
  apiKey: `sk_live_${Buffer.from(`fake-admin-key-${i + 1}-${Date.now()}`).toString('base64').slice(0, 32)}`,
  lastLogin: new Date(Date.now() - i * 3600000).toISOString(),
}));

module.exports = {
  customers,
  products,
  orders,
  adminUsers,
  generateCustomer,
  generateOrder,
  fakeCreditCard,
  fakeSsn,
  fakeEmail,
  fakePhone,
};
