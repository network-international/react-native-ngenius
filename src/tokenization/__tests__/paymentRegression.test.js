jest.mock('react-native', () => ({ NativeModules: { NiSdk: { initiateCardPaymentUI: jest.fn(), initiateApplePay: jest.fn() } }, Platform: { OS: 'ios' } }));
const { NativeModules } = require('react-native');
const { initiateCardPayment, initiateApplePay } = require('../../nativePayments');
it('preserves PAYMENT Card status and keeps tokenization metadata out of payment calls', async () => {
  const order = { reference: 'order', paymentMethods: { card: ['VISA'], wallet: ['GOOGLE_PAY'] } };
  const expected = { reference: 'order', paymentMethods: { card: ['VISA'] } };
  NativeModules.NiSdk.initiateCardPaymentUI.mockImplementation((value, callback) => callback('Success'));
  await expect(initiateCardPayment(order)).resolves.toEqual({ status: 'Success' });
  expect(NativeModules.NiSdk.initiateCardPaymentUI).toHaveBeenCalledWith(expected, expect.any(Function));
  expect(order.paymentMethods.wallet).toEqual(['GOOGLE_PAY']);
  for (const status of ['Failed', 'Aborted']) {
    NativeModules.NiSdk.initiateCardPaymentUI.mockImplementation((value, callback) => callback(status));
    await expect(initiateCardPayment(order)).rejects.toEqual({ status });
  }
});
it('preserves the existing PAYMENT Apple Pay path', async () => {
  NativeModules.NiSdk.initiateApplePay.mockImplementation((order, config, callback) => callback('Success'));
  await expect(initiateApplePay({ amount: { value: 100, currencyCode: 'AED' } }, { merchantIdentifier: 'merchant.test', countryCode: 'AE' })).resolves.toEqual({ status: 'Success' });
  const config = NativeModules.NiSdk.initiateApplePay.mock.calls[0][1];
  expect(config.totalAmount).toBe(1);
  expect(config).not.toHaveProperty('consentData');
});
