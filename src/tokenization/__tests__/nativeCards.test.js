jest.mock('react-native', () => ({ DeviceEventEmitter: { addListener: jest.fn() }, NativeModules: { NiSdk: { presentTokenizationCard: jest.fn(), submitTokenizationCard: jest.fn(), failTokenizationCard: jest.fn(), cancelTokenizationCard: jest.fn() } } }));
const { NativeModules, DeviceEventEmitter } = require('react-native');
const { startNativeCardTokenization } = require('../nativeCards');
const { createTokenizationClient } = require('../api/TokenizationClient');
const { registerCardContext } = require('../cardContext');
const { skipped } = require('./fixtures/consent');
const { addCardResponse } = require('./fixtures/tokenizationApiSpec');
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

it('normalizes the specification Add Card advisedTokens list to tokens, newest first', async () => {
  const attempt = create();
  await ready(id);
  result('Response', addCardResponse);
  const outcome = await attempt.promise;
  expect(outcome.state).toBe('SUCCESS');
  expect(outcome.updatedTokenList).not.toHaveProperty('advisedTokens');
  expect(outcome.updatedTokenList.tokens.map(token => [token.tokenRef, token.cardDetails.last4])).toEqual([
    ['019a9a25-7e8f-7a90-8b1c-2d3e4f5a6b7c', '1111'],
    ['019a8f3c-6d2e-7b41-9c5a-3e8d1f2a4b6c', '4444'],
  ]);
  expect(outcome.updatedTokenList.tokens[0]).not.toHaveProperty('usageType');
});

it('rejects the old single-token response without returning its contents', async () => {
  const attempt = create();
  await ready(id);
  result('Response', verifiedCard);
  const outcome = await attempt.promise;
  expect(outcome.result.code).toBe('MALFORMED_RESPONSE');
  expect(JSON.stringify(outcome)).not.toContain(verifiedCard.tokenRef);
});

it('reports the HTTP status for an expired session without forwarding other native fields', async () => {
  const attempt = create();
  await ready(id);
  result('Failed', { httpStatus: 401, error: 'sensitive native error body' });
  const outcome = await attempt.promise;
  expect(outcome).toMatchObject({ state: 'FAILED', result: { httpStatus: 401 } });
  expect(JSON.stringify(outcome)).not.toContain('sensitive native error body');
});

it.each([
  { code: 'REQUEST_TIMEOUT' },
  { httpStatus: 408 },
  { httpStatus: 504 },
  { code: 'REQUEST_TIMEOUT', httpStatus: 504 },
])('keeps a native request timeout terminal and sanitized for %j', async response => {
  const attempt = create();
  await ready(id);
  result('Failed', { ...response, message: 'private native timeout details' });
  const outcome = await attempt.promise;
  expect(outcome).toMatchObject({ state: 'FAILED', result: { code: 'REQUEST_TIMEOUT' } });
  if (response.httpStatus) expect(outcome.result.httpStatus).toBe(response.httpStatus);
  expect(JSON.stringify(outcome)).not.toContain('private native timeout details');
  result('Response', { tokens: [verifiedCard] });
  await ready(id);
  expect(await attempt.promise).toBe(outcome);
  expect(native.submitTokenizationCard).toHaveBeenCalledTimes(1);
  expect(DeviceEventEmitter.addListener.mock.results[0].value.remove).toHaveBeenCalledTimes(1);
});

it('preserves a preparation timeout without submitting or exposing provider details', async () => {
  const prepareRequest = jest.fn().mockRejectedValue({ code: 'REQUEST_TIMEOUT', message: 'private provider details' });
  const client = registerCardContext({}, { prepareRequest });
  const attempt = create({ client });
  await ready(id);
  const outcome = await attempt.promise;
  expect(outcome).toMatchObject({ state: 'FAILED', result: { code: 'REQUEST_TIMEOUT' } });
  expect(JSON.stringify(outcome)).not.toContain('private provider details');
  expect(native.failTokenizationCard).toHaveBeenCalledWith(id);
  expect(native.submitTokenizationCard).not.toHaveBeenCalled();
  result('Response', { tokens: [verifiedCard] });
  expect(await attempt.promise).toBe(outcome);
  expect(prepareRequest).toHaveBeenCalledTimes(1);
});

it('keeps a connection failure distinct from a timeout', async () => {
  const attempt = create();
  await ready(id);
  result('Failed', { code: 'NETWORK_ERROR' });
  expect(await attempt.promise).toMatchObject({ state: 'FAILED', result: { code: 'NETWORK_ERROR' } });
});

it('retains a valid masked card when the native response has no expiry', async () => {
  const attempt = create();
  await ready(id);
  result('Response', { tokens: [{ ...verifiedCard, cardDetails: { scheme: 'VISA', last4: '1111' } }] });
  expect(await attempt.promise).toMatchObject({ state: 'SUCCESS', updatedTokenList: {
    tokens: [{ tokenRef: 'card-ref', cardDetails: { scheme: 'VISA', last4: '1111' } }],
  } });
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
  const getConsentData = jest.fn(skipped);
  const attempt = startNativeCardTokenization({ client, ...action, getConsentData });
  const first = ready(id); const duplicate = ready(id);
  expect(getConsentData).toHaveBeenCalledTimes(1);
  expect(native.submitTokenizationCard).not.toHaveBeenCalled();
  resolve('fixture'); await first; await duplicate;
  expect(native.submitTokenizationCard).toHaveBeenCalledTimes(1); attempt.cancel(); await attempt.promise;
});
it('keeps provider failures out of native requests and user-visible error payloads', async () => {
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken: async () => { throw new Error('private-credential'); } });
  const attempt = startNativeCardTokenization({ client, ...action, getConsentData: skipped });
  await ready(id); const outcome = await attempt.promise;
  expect(native.submitTokenizationCard).not.toHaveBeenCalled();
  expect(outcome.result.code).toBe('ACCESS_TOKEN_UNAVAILABLE');
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
