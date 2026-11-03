jest.mock('react-native', () => ({ DeviceEventEmitter: { addListener: jest.fn() }, NativeModules: { NiSdk: { presentTokenizationCard: jest.fn(), submitTokenizationCard: jest.fn(), failTokenizationCard: jest.fn(), cancelTokenizationCard: jest.fn() } } }));
const { NativeModules, DeviceEventEmitter } = require('react-native');
const { startNativeCardTokenization } = require('../nativeCards');
const { createTokenizationClient } = require('../api/TokenizationClient');
const { skipped } = require('./fixtures/consent');
const native = NativeModules.NiSdk;
let ready, result, id;
beforeEach(() => {
  jest.clearAllMocks();
  DeviceEventEmitter.addListener.mockImplementation((event, listener) => { ready = requestId => listener({ requestId }); return { remove: jest.fn() }; });
  native.presentTokenizationCard.mockImplementation((config, onResult) => { id = config.requestId; result = onResult; });
  native.failTokenizationCard.mockImplementation(() => result('Failed', {}));
  native.cancelTokenizationCard.mockImplementation(() => result('Aborted', {}));
});
const create = extra => {
  const getAccessToken = jest.fn().mockResolvedValue('fixture-fresh-access');
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken });
  const getConsentData = jest.fn(skipped);
  return { getAccessToken, getConsentData, ...startNativeCardTokenization({ client, outletRef: 'outlet', getConsentData,
    presentation: { labels: { title: 'Add Card' } }, ...extra }) };
};
it('fetches fresh auth only after native validation, and sends only safe metadata to native', async () => {
  const attempt = create();
  expect(native.presentTokenizationCard.mock.calls[0]).toHaveLength(2);
  expect(attempt.getAccessToken).not.toHaveBeenCalled();
  expect(attempt.getConsentData).not.toHaveBeenCalled();
  await ready(id); await ready(id);
  expect(attempt.getAccessToken).toHaveBeenCalledTimes(1);
  expect(native.submitTokenizationCard).toHaveBeenCalledTimes(1);
  expect(native.submitTokenizationCard).toHaveBeenCalledWith(id, { url: 'https://sandbox.test/api/outlets/outlet/cards', accessToken: 'fixture-fresh-access', consentData: skipped() });
  const bridgeJSON = JSON.stringify(native.submitTokenizationCard.mock.calls[0][1]);
  expect(bridgeJSON).not.toMatch(/"pan"|"cvv"|"card"|cardholderName/);
  result('Aborted', {}); await attempt.promise;
  expect(DeviceEventEmitter.addListener.mock.results[0].value.remove).toHaveBeenCalledTimes(1);
});
it.each(['VERIFIED', 'AWAIT_3DS', 'FAILED'])('maps Card %s without starting 3DS or a payment', async status => {
  const attempt = create(); await ready(id);
  result('Response', { tokenRef: 'fixture', type: 'CARD', status, cardDetails: { scheme: 'VISA', last4: '1111', expiry: '2099-12' } });
  const outcome = await attempt.promise;
  expect(outcome.result.niTokenCreated).toBe(status === 'VERIFIED');
  expect(outcome.result.status).toBe(status);
  expect(outcome.result.capture).toBe('REAL_TOKENIZATION_API');
  result('Failed', {}); // A duplicate native result cannot change the settled outcome.
});
it('cancels a closed session without fetching credentials or submitting', async () => {
  let current = true; const attempt = create({ isCurrent: () => current }); current = false;
  await ready(id); await attempt.promise;
  expect(attempt.getAccessToken).not.toHaveBeenCalled();
  expect(native.submitTokenizationCard).not.toHaveBeenCalled();
  expect(native.cancelTokenizationCard).toHaveBeenCalledTimes(1);
});
it('ignores a duplicate ready callback while the provider is pending', async () => {
  let resolve; const provider = new Promise(r => { resolve = r; });
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken: () => provider });
  const attempt = startNativeCardTokenization({ client, outletRef: 'outlet', getConsentData: skipped });
  const first = ready(id); const duplicate = ready(id); resolve('fixture'); await first; await duplicate;
  expect(native.submitTokenizationCard).toHaveBeenCalledTimes(1); attempt.cancel(); await attempt.promise;
});
it('keeps provider failures out of native requests and user-visible error payloads', async () => {
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken: async () => { throw new Error('private-credential'); } });
  const attempt = startNativeCardTokenization({ client, outletRef: 'outlet', getConsentData: skipped });
  await ready(id); const outcome = await attempt.promise;
  expect(native.submitTokenizationCard).not.toHaveBeenCalled();
  expect(JSON.stringify(outcome)).not.toContain('private-credential');
});

it('never bypasses a mock/custom JS transport with a native Card POST', async () => {
  const getAccessToken = jest.fn();
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken, transport: jest.fn() });
  const attempt = startNativeCardTokenization({ client, outletRef: 'outlet', getConsentData: skipped });
  await ready(id); await attempt.promise;
  expect(getAccessToken).not.toHaveBeenCalled(); expect(native.submitTokenizationCard).not.toHaveBeenCalled();
});

it('rejects missing outlet configuration before collecting card data', async () => {
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken: jest.fn() });
  const attempt = startNativeCardTokenization({ client, getConsentData: skipped });
  expect((await attempt.promise).result.code).toBe('NATIVE_CARD_UNAVAILABLE');
  expect(native.presentTokenizationCard).not.toHaveBeenCalled();
});
