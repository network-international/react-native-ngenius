jest.mock('react-native', () => ({ NativeModules: { NiSdk: { captureApplePayToken: jest.fn(), isApplePayTokenizationSupported: jest.fn(), initiateApplePay: jest.fn(), initiateGooglePay: jest.fn() } }, Platform: { OS: 'ios' } }));
const { NativeModules, Platform } = require('react-native');
const { captureApplePayToken, captureGooglePayToken, isApplePayTokenizationSupported } = require('../nativeWallets');
const native = NativeModules.NiSdk;
const order = { amount: { value: 0, currencyCode: 'AED' } };
const config = { merchantIdentifier: 'merchant.test', countryCode: 'AE', merchantName: 'QA' };
beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'ios'; });
it('returns only raw encrypted Apple paymentData without parsing or re-encoding', async () => {
  const encrypted = '{ "data" : "encrypted", "version": "EC_v1" }\n';
  native.captureApplePayToken.mockImplementation((request, callback) => callback('Success', encrypted));
  await expect(captureApplePayToken(order, config)).resolves.toEqual({ token: encrypted });
  expect(native.captureApplePayToken).toHaveBeenCalledWith({ ...config, amount: '0.00', currencyCode: 'AED' }, expect.any(Function));
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

const googleConfig = { merchantName: 'QA', gateway: 'networkintl', gatewayMerchantId: 'test-merchant' };
const zeroOrder = { amount: { value: 0, currencyCode: 'AED', formattedValue: '999.99' } };
it.each(['AED', 'JPY', 'KWD'])('captures a Google-compatible zero amount in %s without trusting a supplied formatted value', async currencyCode => {
  Platform.OS = 'android';
  const token = 'opaque-encrypted-token';
  native.initiateGooglePay.mockImplementation((requestConfig, requestOrder, callback) => callback('Success', token));
  await expect(captureGooglePayToken({ amount: { ...zeroOrder.amount, currencyCode } }, googleConfig)).resolves.toEqual({ token });
  expect(native.initiateGooglePay).toHaveBeenCalledWith(googleConfig, { currencyCode, amount: '0.00' }, expect.any(Function));
});

it.each([
  ['platform', 'ios', zeroOrder, googleConfig],
  ['missing currency', 'android', { amount: { value: 0 } }, googleConfig],
  ['invalid currency', 'android', { amount: { value: 0, currencyCode: 'ZZZ' } }, googleConfig],
  ['nonzero capture', 'android', { amount: { ...order.amount, value: 100 } }, googleConfig],
  ['missing configuration', 'android', zeroOrder, undefined],
  ['missing gateway', 'android', zeroOrder, { ...googleConfig, gateway: '' }],
])('rejects Google Pay %s before native capture', async (_case, platform, captureOrder, captureConfig) => {
  Platform.OS = platform;
  await expect(captureGooglePayToken(captureOrder, captureConfig)).rejects.toEqual({ status: 'Failed', code: 'GOOGLE_PAY_CONFIGURATION_REQUIRED' });
  expect(native.initiateGooglePay).not.toHaveBeenCalled();
});

it.each(['Aborted', 'Failed', 'unexpected'])('does not expose Google Pay callback error payload for %s', async status => {
  Platform.OS = 'android';
  native.initiateGooglePay.mockImplementation((_config, _order, callback) => callback(status, 'private-payload'));
  await expect(captureGooglePayToken(zeroOrder, googleConfig)).rejects.toEqual({ status: status === 'Aborted' ? 'Aborted' : 'Failed' });
});

it('sanitizes a synchronous native Google Pay error', async () => {
  Platform.OS = 'android';
  native.initiateGooglePay.mockImplementation(() => { throw new Error('private-payload'); });
  await expect(captureGooglePayToken(zeroOrder, googleConfig)).rejects.toEqual({ status: 'Failed' });
});

it('leaves the legacy PAYMENT Google Pay zero rejection unchanged', async () => {
  Platform.OS = 'android';
  const { initiateGooglePay } = require('../../nativePayments');
  await expect(initiateGooglePay(zeroOrder, googleConfig)).rejects.toEqual({ status: 'Error', error: 'Order amount is missing' });
  expect(native.initiateGooglePay).not.toHaveBeenCalled();
});


it.each(['AED', 'JPY', 'KWD'])('captures Apple Pay at zero in %s and ignores formatted amount overrides', async currencyCode => {
  native.captureApplePayToken.mockImplementation((_request, callback) => callback('Success', 'opaque-token'));
  const captureConfig = { ...config, amount: '777.77', currencyCode: 'USD', supportedNetworks: ['VISA'] };
  await expect(captureApplePayToken({ amount: { value: 0, currencyCode, formattedValue: '999.99' } }, captureConfig))
    .resolves.toEqual({ token: 'opaque-token' });
  expect(native.captureApplePayToken).toHaveBeenCalledWith({ ...captureConfig, amount: '0.00', currencyCode }, expect.any(Function));
});

it.each([
  { amount: { value: 100, currencyCode: 'AED' } },
  { amount: { value: 0, currencyCode: 'ZZZ' } },
  { amount: { value: 0 } },
])('rejects an invalid Apple capture amount or currency before native presentation (%j)', async captureOrder => {
  await expect(captureApplePayToken(captureOrder, config))
    .rejects.toEqual({ status: 'Failed', code: 'APPLE_PAY_CONFIGURATION_REQUIRED' });
  expect(native.captureApplePayToken).not.toHaveBeenCalled();
});

it('sanitizes a synchronous native Apple Pay error', async () => {
  native.captureApplePayToken.mockImplementation(() => { throw new Error('private-encrypted-payload'); });
  await expect(captureApplePayToken(order, config)).rejects.toEqual({ status: 'Failed' });
});

it('checks the explicit Apple tokenization networks without invoking legacy payment APIs', async () => {
  const captureConfig = { ...config, supportedNetworks: ['VISA'] };
  native.isApplePayTokenizationSupported.mockImplementation((_request, callback) => callback(true));
  await expect(isApplePayTokenizationSupported(captureConfig)).resolves.toBe(true);
  expect(native.isApplePayTokenizationSupported).toHaveBeenCalledWith(captureConfig, expect.any(Function));
  expect(native.initiateApplePay).not.toHaveBeenCalled();
});

it.each([false, 'true', 1, undefined])('does not treat malformed native readiness as supported (%j)', async supported => {
  native.isApplePayTokenizationSupported.mockImplementation((_request, callback) => callback(supported));
  await expect(isApplePayTokenizationSupported(config)).resolves.toBe(false);
});

it('fails closed when the network-aware native readiness bridge is unavailable or throws', async () => {
  native.isApplePayTokenizationSupported.mockImplementation(() => { throw new Error('private-config'); });
  await expect(isApplePayTokenizationSupported(config)).resolves.toBe(false);
  const saved = native.isApplePayTokenizationSupported;
  try {
    native.isApplePayTokenizationSupported = undefined;
    await expect(isApplePayTokenizationSupported(config)).resolves.toBe(false);
  } finally { native.isApplePayTokenizationSupported = saved; }
});
