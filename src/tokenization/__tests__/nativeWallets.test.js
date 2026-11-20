jest.mock('react-native', () => ({ NativeModules: { NiSdk: { captureApplePayToken: jest.fn(), initiateApplePay: jest.fn() } }, Platform: { OS: 'ios' } }));
const { NativeModules, Platform } = require('react-native');
const { captureApplePayToken } = require('../nativeWallets');
const native = NativeModules.NiSdk;
const order = { amount: { value: 100, currencyCode: 'AED' } };
const config = { merchantIdentifier: 'merchant.test', countryCode: 'AE', merchantName: 'QA' };
beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'ios'; });
it('returns only raw encrypted Apple paymentData without parsing or re-encoding', async () => {
  const encrypted = '{ "data" : "encrypted", "version": "EC_v1" }\n';
  native.captureApplePayToken.mockImplementation((request, callback) => callback('Success', encrypted));
  await expect(captureApplePayToken(order, config)).resolves.toEqual({ token: encrypted });
  expect(native.captureApplePayToken).toHaveBeenCalledWith({ ...config, amount: '1.00', currencyCode: 'AED' }, expect.any(Function));
  expect(native.initiateApplePay).not.toHaveBeenCalled();
});
it.each(['Aborted', 'Failed'])('preserves %s without a payload in the error', async (status) => {
  native.captureApplePayToken.mockImplementation((request, callback) => callback(status, 'private-payload'));
  await expect(captureApplePayToken(order, config)).rejects.toEqual({ status });
});
it('requires public merchant configuration and an iOS native capture implementation', async () => {
  Platform.OS = 'android';
  await expect(captureApplePayToken(order, config)).rejects.toMatchObject({ status: 'Failed' });
  expect(native.captureApplePayToken).not.toHaveBeenCalled();
});
