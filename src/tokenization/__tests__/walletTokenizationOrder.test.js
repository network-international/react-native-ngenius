const { walletTokenizationOrder } = require('../walletTokenizationOrder');

it('sets the tokenization wallet sheet to zero without mutating the merchant payment order', () => {
  const original = { reference: 'payment-order', amount: { value: 15000, formattedValue: '150.00', currencyCode: 'AED' }, paymentMethods: { wallet: ['APPLE_PAY', 'GOOGLE_PAY'] } };
  const capture = walletTokenizationOrder(original);
  expect(capture.amount).toEqual({ value: 0, formattedValue: '0.00', currencyCode: 'AED' });
  expect(original.amount.value).toBe(15000);
  expect(original.amount.formattedValue).toBe('150.00');
  expect(capture.paymentMethods).toBe(original.paymentMethods);
});
