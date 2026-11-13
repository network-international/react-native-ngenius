const { runGooglePayTokenization, runWalletTokenization } = require('../walletTokenization');
const { UsageType } = require('../usageType');
const { VERIFICATION_STATES } = require('../verificationStates');
const { buildConsentData } = require('../consentData');
const { inputs, skipped } = require('./fixtures/consent');

const payload = '{ "opaque": "encrypted bytes" }\n';
const order = { amount: { value: 100, currencyCode: 'AED' } };
const googlePayConfig = { merchantName: 'Demo', gateway: 'networkintl', gatewayMerchantId: 'm' };
const wallet = {
  tokenRef: 'wallet-token',
  type: 'WALLET',
  walletType: 'GOOGLE_PAY',
  status: 'VERIFIED',
  cardDetails: { scheme: 'MASTERCARD', last4: '5100', expiry: '2029-06' },
};
const tokenList = {
  tokens: [wallet, {
    ...wallet,
    tokenRef: 'existing-token',
    type: 'CARD',
    walletType: null,
  }],
  tncUrl: 'https://merchant.example/terms',
};

const setup = (overrides = {}) => {
  const addWallet = jest.fn().mockResolvedValue(tokenList);
  const createSession = jest.fn();
  const getSession = jest.fn();
  const initiateGooglePay = jest.fn().mockResolvedValue({ token: payload });
  const onVerifying = jest.fn();
  const client = { supportsAddWallet: true, addWallet, createSession, getSession };
  const action = {
    client,
    outletRef: 'outlet-1',
    sessionRef: 'session-1',
    usageType: UsageType.ONCE_OFF,
    order,
    googlePayConfig,
    initiateGooglePay,
    onVerifying,
    consent: skipped(),
  };
  return {
    action,
    client,
    addWallet,
    createSession,
    getSession,
    initiateGooglePay,
    onVerifying,
    run: () => runGooglePayTokenization({ ...action, ...overrides }),
  };
};

it('returns the injected Add Wallet response directly without reloading the session', async () => {
  const { addWallet, createSession, getSession, initiateGooglePay, onVerifying, run } = setup();
  const outcome = await run();
  expect(initiateGooglePay).toHaveBeenCalledWith(order, googlePayConfig);
  expect(onVerifying).toHaveBeenCalledTimes(1);
  expect(addWallet).toHaveBeenCalledTimes(1);
  expect(addWallet).toHaveBeenCalledWith({
    outletRef: 'outlet-1',
    sessionRef: 'session-1',
    walletType: 'GOOGLE_PAY',
    encryptedPayload: payload,
    usageType: UsageType.ONCE_OFF,
    consentData: skipped(),
  });
  expect(outcome).toEqual({ state: VERIFICATION_STATES.SUCCESS, updatedTokenList: tokenList });
  expect(createSession).not.toHaveBeenCalled();
  expect(getSession).not.toHaveBeenCalled();
});

it.each([true, false])('passes confirmed Apple Pay consent to an injected adapter (skipped=%s)', async skipConsent => {
  const { action, addWallet } = setup();
  const acceptedAt = '2026-10-26T06:15:30.000Z';
  const capturedAt = '2026-10-26T06:17:30.000Z';
  let now = new Date(acceptedAt);
  const outcome = await runWalletTokenization({
    ...action,
    method: 'APPLE_PAY',
    usageType: UsageType.PERMANENT,
    captureWallet: async () => {
      now = new Date(capturedAt);
      return { token: payload };
    },
    getConsentData: () => buildConsentData({
      ...inputs,
      skipConsent,
      accepted: !skipConsent,
      acceptedAt,
      language: 'ar',
      tncUrl: 'https://merchant.example/terms',
      now: () => now,
    }),
  });
  expect(outcome.state).toBe(VERIFICATION_STATES.SUCCESS);
  expect(addWallet.mock.calls[0][0]).toMatchObject({
    walletType: 'APPLE_PAY',
    usageType: UsageType.PERMANENT,
    encryptedPayload: payload,
  });
  const { consentData } = addWallet.mock.calls[0][0];
  expect(consentData).toMatchObject({
    status: skipConsent ? 'NOT_COLLECTED' : 'COLLECTED',
    clientTimestamp: skipConsent ? capturedAt : acceptedAt,
    channel: 'REACT_NATIVE',
  });
  if (skipConsent) {
    expect(consentData.skippedByMerchant).toBe(true);
    expect(consentData).not.toHaveProperty('locale');
  } else {
    expect(consentData.locale).toBe('ar');
    expect(consentData.tncUrl).toBe('https://merchant.example/terms');
  }
});

it('does not open a wallet sheet without explicit Add Wallet support', async () => {
  const { client, addWallet, initiateGooglePay, onVerifying, run } = setup();
  delete client.supportsAddWallet;
  expect(await run()).toMatchObject({
    state: VERIFICATION_STATES.FAILED,
    result: { code: 'ADD_WALLET_BACKEND_PENDING', niTokenCreated: false },
  });
  expect(initiateGooglePay).not.toHaveBeenCalled();
  expect(onVerifying).not.toHaveBeenCalled();
  expect(addWallet).not.toHaveBeenCalled();
});

it.each([undefined, 'private-value'])('validates usageType before native capture (%#)', async usageType => {
  const { addWallet, initiateGooglePay, run } = setup({ usageType });
  const outcome = await run();
  expect(outcome).toMatchObject({
    state: VERIFICATION_STATES.FAILED,
    result: { code: 'INVALID_USAGE_TYPE' },
  });
  expect(initiateGooglePay).not.toHaveBeenCalled();
  expect(addWallet).not.toHaveBeenCalled();
  expect(JSON.stringify(outcome)).not.toContain('private-value');
});

it('does not start a wallet action for a closed session', async () => {
  const { addWallet, initiateGooglePay, run } = setup({ isCurrent: () => false });
  expect(await run()).toEqual({ state: VERIFICATION_STATES.READY });
  expect(initiateGooglePay).not.toHaveBeenCalled();
  expect(addWallet).not.toHaveBeenCalled();
});

it('returns to READY without a request when the shopper aborts capture', async () => {
  const { addWallet, initiateGooglePay, onVerifying, run } = setup();
  initiateGooglePay.mockRejectedValue({ status: 'Aborted' });
  expect(await run()).toEqual({ state: VERIFICATION_STATES.READY });
  expect(addWallet).not.toHaveBeenCalled();
  expect(onVerifying).not.toHaveBeenCalled();
});

it('rejects a native response without encrypted payload before the adapter', async () => {
  const { addWallet, initiateGooglePay, run } = setup();
  initiateGooglePay.mockResolvedValue({});
  expect(await run()).toMatchObject({ result: { code: 'WALLET_TOKEN_MISSING' } });
  expect(addWallet).not.toHaveBeenCalled();
});

it('rejects a malformed updated list without echoing adapter data', async () => {
  const { addWallet, run } = setup();
  addWallet.mockResolvedValue({ tokens: payload });
  const outcome = await run();
  expect(outcome).toMatchObject({ result: { code: 'MALFORMED_RESPONSE' } });
  expect(JSON.stringify(outcome)).not.toContain('encrypted bytes');
});

it('does not echo an encrypted payload from native or client errors', async () => {
  const { addWallet, initiateGooglePay, run } = setup();
  initiateGooglePay.mockRejectedValueOnce({ status: 'Failed', error: payload });
  const nativeError = await run();
  expect(nativeError).toMatchObject({ result: { code: 'WALLET_CAPTURE_FAILED' } });
  expect(addWallet).not.toHaveBeenCalled();
  addWallet.mockRejectedValue(new Error(payload));
  const clientError = await run();
  expect(clientError).toMatchObject({ result: { code: 'ADD_WALLET_FAILED' } });
  expect(JSON.stringify([nativeError, clientError])).not.toContain('encrypted bytes');
});

it('does not update the list if the session closes before Add Wallet returns', async () => {
  let active = true;
  const { addWallet, run } = setup({ isCurrent: () => active });
  addWallet.mockImplementation(async () => {
    active = false;
    return tokenList;
  });
  expect(await run()).toEqual({ state: VERIFICATION_STATES.READY });
});
