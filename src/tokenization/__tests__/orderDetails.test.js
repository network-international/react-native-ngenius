const { normalizeOrderDetails, normalizeOrderMoney } = require('../orderDetails');
const money = (currencyCode, value) => ({ currencyCode, value });
afterEach(() => jest.restoreAllMocks());

it.each([
  ['AED', '3910', '39.10'], ['JPY', '3910', '3910'], ['KWD', '3910', '3.910'],
  ['BHD', 1, '0.001'], ['CLF', '3910', '0.3910'], ['AED', 0, '0.00'], ['JPY', '0', '0'],
])('preserves currency minor units for %s %p', (currencyCode, value, expected) => {
  expect(normalizeOrderMoney(money(currencyCode, value)).formattedValue).toBe(expected);
});

it('keeps large integer strings exact and does not trust a conflicting formatted string', () => {
  const value = '9007199254740993123456789';
  const result = normalizeOrderMoney({ currencyCode: 'AED', value, formattedValue: '0.01' });
  expect(result.value).toBe(value);
  expect(result.formattedValue).toBe('90071992547409931234567.89');
  expect(result.text).toBe('AED 90,071,992,547,409,931,234,567.89');
});

it.each([undefined, null, '', '1.25', '-1', '1e3', '100junk', true, NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1])(
  'omits invalid minor values rather than rounding or guessing %p', value => {
    expect(normalizeOrderMoney(money('AED', value))).toBeNull();
  }
);

it('supports exact canonical major strings only when minor value is absent', () => {
  expect(normalizeOrderMoney({ currencyCode: 'KWD', formattedValue: '3.910' }).value).toBe('3910');
  expect(normalizeOrderMoney({ currencyCode: 'AED', formattedValue: '0.000' }).formattedValue).toBe('0.00');
  expect(normalizeOrderMoney({ currencyCode: 'KWD', formattedValue: '3.9105' })).toBeNull();
  expect(normalizeOrderMoney({ currencyCode: 'JPY', formattedValue: '1.1' })).toBeNull();
  expect(normalizeOrderMoney({ currencyCode: 'AED', formattedValue: 'AED 39.10' })).toBeNull();
  expect(normalizeOrderMoney({ currencyCode: 'AED', value: 'bad', formattedValue: '39.10' })).toBeNull();
});

it('never supplies a missing or unknown currency or a fallback fraction precision', () => {
  expect(normalizeOrderMoney({ value: '3910' })).toBeNull();
  expect(normalizeOrderMoney(money('XYZ', '3910'))).toBeNull();
  jest.spyOn(Intl, 'NumberFormat').mockImplementation(() => { throw new Error('Intl unavailable'); });
  expect(normalizeOrderMoney(money('AED', '3910'))).toBeNull();
});

it('still validates known currencies on Intl engines without supportedValuesOf', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'supportedValuesOf');
  Object.defineProperty(Intl, 'supportedValuesOf', { configurable: true, value: undefined });
  try {
    expect(normalizeOrderMoney(money('JPY', '3910')).formattedValue).toBe('3910');
    expect(normalizeOrderMoney(money('KWD', '3910')).formattedValue).toBe('3.910');
    expect(normalizeOrderMoney(money('XYZ', '3910'))).toBeNull();
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'supportedValuesOf', descriptor);
    else delete Intl.supportedValuesOf;
  }
});

it('keeps display amount separate from the immutable wallet zero-value context', () => {
  const source = { language: 'ar', amount: money('AED', '3910'), orderSummary: { items: [
    { description: 'Chair', totalPrice: money('AED', '3910') },
  ] } };
  const before = JSON.stringify(source);
  const model = normalizeOrderDetails({ orderDetails: source, language: 'fr' });
  const capture = require('../walletTokenizationOrder').walletTokenizationOrder(source);
  expect(model.language).toBe('fr');
  expect(model.amount.formattedValue).toBe('39.10');
  expect(model.amount.text).toBe('AED 39,10');
  expect(capture.amount.value).toBe(0);
  expect(JSON.stringify(source)).toBe(before);
});

it('uses explicit order details without merging legacy fields', () => {
  const order = { language: 'fr', amount: money('AED', 3910) };
  expect(normalizeOrderDetails({ order }).amount.formattedValue).toBe('39.10');
  expect(normalizeOrderDetails({ order }).language).toBe('fr');
  expect(normalizeOrderDetails({ orderDetails: {}, order })).toBeNull();
  expect(normalizeOrderDetails({ orderDetails: 'invalid', order })).toBeNull();
  expect(normalizeOrderDetails({ orderDetails: { language: 'ar', amount: money('KWD', '3910') }, order }).language).toBe('ar');
});

it('does not multiply line totals by quantity, convert currencies, or invent summary totals/fees', () => {
  const model = normalizeOrderDetails({ orderDetails: {
    amount: money('AED', '3910'),
    orderSummary: { items: [
      { description: 'Item without quantity', totalPrice: money('AED', '3910') },
      { description: 'Already a line total', quantity: 3, totalPrice: money('KWD', '3910') },
      { description: 'Zero amount', quantity: 0, totalPrice: money('JPY', 0) },
    ] },
  } });
  expect(model.items).toHaveLength(3);
  expect(model.items[0].quantity).toBeUndefined();
  expect(model.items[1].totalPrice.formattedValue).toBe('3.910');
  expect(model.items[2].totalPrice.formattedValue).toBe('0');
  expect(model.items[2].quantity).toBe('0');
  expect(model.total).toBeNull();
  expect(model.shipping).toBeNull();
  expect(model.tax).toBeNull();
});

it('retains long descriptions and supplied categories while omitting invalid/private fields', () => {
  const description = 'Long product description '.repeat(70);
  const model = normalizeOrderDetails({ orderDetails: { orderSummary: { items: [
    { description, category: 'Furniture', quantity: '2', totalPrice: money('AED', 'bad'), accessToken: 'private', pan: 'private' },
    { description: '', totalPrice: money('AED', 100) },
    { description: 'Price omitted, description remains', totalPrice: { value: 100 } },
  ] } } });
  expect(model.items).toHaveLength(2);
  expect(model.items[0].description).toBe(description.trim());
  expect(model.items[0].category).toBe('Furniture');
  expect(model.items[0].quantity).toBe('2');
  expect(model.items[0].totalPrice).toBeNull();
  expect(JSON.stringify(model)).not.toContain('private');
});

it('shows only explicitly provided valid totals, shipping and tax', () => {
  const model = normalizeOrderDetails({ orderDetails: { amount: money('AED', '5000'), orderSummary: {
    total: money('JPY', '3910'), shipping: money('KWD', 0), tax: { value: 200 },
  } } });
  expect(model.amount.formattedValue).toBe('50.00');
  expect(model.total.formattedValue).toBe('3910');
  expect(model.shipping.formattedValue).toBe('0.000');
  expect(model.tax).toBeNull();
});
