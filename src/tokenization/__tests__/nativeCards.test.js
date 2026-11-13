jest.mock('react-native', () => ({ DeviceEventEmitter: { addListener: jest.fn() }, NativeModules: { NiSdk: { presentTokenizationCard: jest.fn(), submitTokenizationCard: jest.fn(), failTokenizationCard: jest.fn(), cancelTokenizationCard: jest.fn() } } }));
const { NativeModules, DeviceEventEmitter } = require('react-native');
const { startNativeCardTokenization } = require('../nativeCards');
const { createTokenizationClient } = require('../api/TokenizationClient');
const { skipped } = require('./fixtures/consent');
const { UsageType } = require('../usageType');
const action = { outletRef: 'outlet', sessionRef: 'session-1', usageType: UsageType.PERMANENT };
const url = 'https://sandbox.test/api/outlets/outlet/payment-tokenization-sessions/session-1/cards';
const verifiedCard = {
  tokenRef: 'card-ref',
  type: 'CARD',
  status: 'VERIFIED',
  cardDetails: { scheme: 'VISA', last4: '1111', expiry: '2099-12' },
};
const native = NativeModules.NiSdk;
let ready, result, id;
beforeEach(() => {
  jest.clearAllMocks();
  ready = undefined;
  result = undefined;
  id = undefined;
  DeviceEventEmitter.addListener.mockImplementation((event, listener) => { ready = requestId => listener({ requestId }); return { remove: jest.fn() }; });
  native.presentTokenizationCard.mockImplementation((config, onResult) => { id = config.requestId; result = onResult; });
  native.failTokenizationCard.mockImplementation(() => result('Failed', {}));
  native.cancelTokenizationCard.mockImplementation(() => result('Aborted', {}));
});
const create = extra => {
  const getAccessToken = jest.fn().mockResolvedValue('fixture-fresh-access');
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken });
  const getConsentData = jest.fn(skipped);
  return { getAccessToken, getConsentData, ...startNativeCardTokenization({ client, ...action, getConsentData,
    presentation: { labels: { title: 'Add Card' } }, ...extra }) };
};
it.each([UsageType.ONCE_OFF, UsageType.PERMANENT])(
  'passes %s and consent to the native session endpoint after native validation',
  async usageType => {
    const attempt = create({ usageType });
    expect(native.presentTokenizationCard).toHaveBeenCalledWith(
      { requestId: id, labels: { title: 'Add Card' } },
      expect.any(Function),
    );
    expect(attempt.getAccessToken).not.toHaveBeenCalled();
    expect(attempt.getConsentData).not.toHaveBeenCalled();
    await ready(id);
    await ready(id);
    expect(attempt.getAccessToken).toHaveBeenCalledTimes(1);
    expect(native.submitTokenizationCard).toHaveBeenCalledTimes(1);
    expect(native.submitTokenizationCard).toHaveBeenCalledWith(id, {
      url,
      sessionRef: action.sessionRef,
      accessToken: 'fixture-fresh-access',
      usageType,
      consentData: skipped(),
    });
    result('Aborted', {});
    await attempt.promise;
    expect(DeviceEventEmitter.addListener.mock.results[0].value.remove).toHaveBeenCalledTimes(1);
  },
);

it.each([undefined, 'PRIVATE_INVALID_USAGE_TYPE'])(
  'returns a sanitized validation error before starting native Card for usageType %s',
  async usageType => {
    const attempt = create({ usageType });
    const outcome = await attempt.promise;
    expect(outcome.result).toMatchObject({
      code: 'INVALID_USAGE_TYPE',
      error: 'usageType must be ONCE_OFF or PERMANENT',
    });
    expect(JSON.stringify(outcome)).not.toContain('PRIVATE_INVALID_USAGE_TYPE');
    expect(native.presentTokenizationCard).not.toHaveBeenCalled();
    expect(native.submitTokenizationCard).not.toHaveBeenCalled();
    expect(attempt.getAccessToken).not.toHaveBeenCalled();
  },
);

it('returns the updated list directly, preserving unverified rows without selecting a token', async () => {
  const attempt = create();
  await ready(id);
  const wallet = {
    tokenRef: 'wallet-ref',
    type: 'WALLET',
    walletType: 'GOOGLE_PAY',
    status: 'AWAIT_3DS',
  };
  const page = { number: 0, size: 2, totalElements: 2, totalPages: 1 };
  const tncUrl = 'https://terms.test/terms';
  result('Response', { tokens: [verifiedCard, wallet], page, tncUrl });
  result('Failed', {}); // A duplicate native result cannot change the settled outcome.
  expect(await attempt.promise).toEqual({
    state: 'SUCCESS',
    updatedTokenList: {
      tokens: [
        { ...verifiedCard, walletType: null },
        { ...wallet, cardDetails: null },
      ],
      page,
      tncUrl,
    },
  });
  expect(attempt.getAccessToken).toHaveBeenCalledTimes(1);
});

it('rejects the old single-token response without returning its contents', async () => {
  const attempt = create();
  await ready(id);
  result('Response', verifiedCard);
  const outcome = await attempt.promise;
  expect(outcome.result.code).toBe('MALFORMED_RESPONSE');
  expect(JSON.stringify(outcome)).not.toContain(verifiedCard.tokenRef);
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
  const attempt = startNativeCardTokenization({ client, ...action, getConsentData: skipped });
  const first = ready(id); const duplicate = ready(id); resolve('fixture'); await first; await duplicate;
  expect(native.submitTokenizationCard).toHaveBeenCalledTimes(1); attempt.cancel(); await attempt.promise;
});
it('keeps provider failures out of native requests and user-visible error payloads', async () => {
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken: async () => { throw new Error('private-credential'); } });
  const attempt = startNativeCardTokenization({ client, ...action, getConsentData: skipped });
  await ready(id); const outcome = await attempt.promise;
  expect(native.submitTokenizationCard).not.toHaveBeenCalled();
  expect(JSON.stringify(outcome)).not.toContain('private-credential');
});

it('never bypasses a mock/custom JS transport with a native Card POST', async () => {
  const getAccessToken = jest.fn();
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken, transport: jest.fn() });
  const attempt = startNativeCardTokenization({ client, ...action, getConsentData: skipped });
  await ready(id);
  await attempt.promise;
  expect(getAccessToken).not.toHaveBeenCalled(); expect(native.submitTokenizationCard).not.toHaveBeenCalled();
});

it('rejects missing outlet configuration before collecting card data', async () => {
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken: jest.fn() });
  const attempt = startNativeCardTokenization({ client, ...action, outletRef: undefined, getConsentData: skipped });
  expect((await attempt.promise).result.code).toBe('NATIVE_CARD_UNAVAILABLE');
  expect(native.presentTokenizationCard).not.toHaveBeenCalled();
});

it.each([undefined, 'private/invalid', 'session-1\n'])(
  'rejects a missing or invalid session reference before collecting card data',
  async sessionRef => {
    const attempt = create({ sessionRef });
    const outcome = await attempt.promise;
    expect(outcome.result.code).toBe('INVALID_SESSION_REF');
    expect(native.presentTokenizationCard).not.toHaveBeenCalled();
    expect(attempt.getAccessToken).not.toHaveBeenCalled();
  },
);
