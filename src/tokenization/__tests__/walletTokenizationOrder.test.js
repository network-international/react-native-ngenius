const { walletTokenizationOrder } = require('../walletTokenizationOrder');

it('uses zero in the session currency and retains only non-monetary caller context', () => {
  const original = { reference: 'payment-order', amount: { value: 15000, formattedValue: '150.00', currencyCode: 'AED' }, orderSummary: { total: { value: 15000, currencyCode: 'AED' } }, paymentMethods: { wallet: ['APPLE_PAY', 'GOOGLE_PAY'] } };
  const sessionAmount = { value: '2000', formattedValue: '20.00', currencyCode: 'USD' };
  const capture = walletTokenizationOrder(original, sessionAmount);
  expect(capture.amount).toEqual({ value: 0, formattedValue: '0.00', currencyCode: 'USD' });
  expect(capture).not.toHaveProperty('orderSummary');
  expect(original.amount.value).toBe(15000);
  expect(original.amount.formattedValue).toBe('150.00');
  expect(original.orderSummary.total.value).toBe(15000);
  expect(sessionAmount.value).toBe('2000');
  expect(capture.paymentMethods).toBe(original.paymentMethods);
});

it.each([['JPY', '0'], ['BHD', '0.000']])('formats a zero capture for the session currency %s without caller context', (currencyCode, formattedValue) => {
  expect(walletTokenizationOrder(undefined, { currencyCode })).toEqual({
    amount: { currencyCode, value: 0, formattedValue },
  });
});

it.each([undefined, null, {}, { currencyCode: '' }, { currencyCode: 'PRIVATE' }, { currencyCode: 'ZZZ' }])('does not fall back to init currency when the session currency is invalid (%#)', sessionAmount => {
  expect(() => walletTokenizationOrder({ amount: { currencyCode: 'AED', value: 1500 } }, sessionAmount))
    .toThrow('A valid session currency is required for wallet capture');
});
