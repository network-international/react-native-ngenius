const { createTokenizationClient } = require('../TokenizationClient');
const { mapAddWalletRequest } = require('../addWallet');
const { TokenizationApiError } = require('../errors');
const { UsageType } = require('../../usageType');
const { collected, skipped } = require('../../__tests__/fixtures/consent');

const encryptedPayload = '{ "opaque": "encrypted bytes" }\n';
const validInput = {
  outletRef: 'outlet-1',
  sessionRef: 'session-1',
  walletType: 'GOOGLE_PAY',
  encryptedPayload,
  usageType: UsageType.ONCE_OFF,
  consentData: skipped(),
};

const setup = () => {
  const getAccessToken = jest.fn();
  const transport = jest.fn();
  const client = createTokenizationClient({
    baseUrl: 'https://tokenization.test',
    getAccessToken,
    transport,
  });
  return { client, getAccessToken, transport };
};

it.each([
  ['APPLE_PAY', UsageType.PERMANENT, collected()],
  ['GOOGLE_PAY', UsageType.ONCE_OFF, skipped()],
])('maps %s to the session request body for %s', (walletType, usageType, consentData) => {
  const request = mapAddWalletRequest({
    ...validInput,
    walletType,
    usageType,
    consentData: { ...consentData, merchantMetadata: 'extra-field' },
    merchantAttributes: { force3DS: 'true' },
  });
  expect(request).toEqual({ walletType, usageType, encryptedPayload, consentData });
  expect(request.encryptedPayload).toBe(encryptedPayload);
  if (consentData.status === 'NOT_COLLECTED') {
    expect(request.consentData.skippedByMerchant).toBe(true);
  }
});

it('rejects Add Wallet as backend-pending before credentials or transport', async () => {
  const { client, getAccessToken, transport } = setup();
  const logs = ['log', 'info', 'warn', 'error', 'debug'].map(level =>
    jest.spyOn(console, level).mockImplementation(() => {}),
  );
  try {
    const error = await client.addWallet(validInput).catch(value => value);
    expect(error).toBeInstanceOf(TokenizationApiError);
    expect(error).toMatchObject({
      status: 0,
      code: 'ADD_WALLET_BACKEND_PENDING',
      message: 'Wallet tokenization is not available yet',
    });
    expect(JSON.stringify(error)).not.toMatch(/encrypted bytes|session-1/);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    logs.forEach(log => expect(log).not.toHaveBeenCalled());
  } finally {
    logs.forEach(log => log.mockRestore());
  }
});

it.each([
  [{ usageType: undefined }, 'INVALID_USAGE_TYPE', 'usageType'],
  [{ usageType: 'private-value' }, 'INVALID_USAGE_TYPE', 'usageType'],
  [{ walletType: 'private-value' }, 'INVALID_WALLET_REQUEST', 'walletType'],
  [{ encryptedPayload: '' }, 'INVALID_WALLET_REQUEST', 'encryptedPayload'],
  [{ encryptedPayload: {} }, 'INVALID_WALLET_REQUEST', 'encryptedPayload'],
  [{ consentData: undefined }, 'INVALID_WALLET_REQUEST', 'consentData'],
  [{ consentData: { status: 'private-value' } }, 'INVALID_WALLET_REQUEST', 'consentData'],
  [{ sessionRef: undefined }, 'INVALID_WALLET_REQUEST', 'sessionRef'],
  [{ sessionRef: 'private-value/' }, 'INVALID_WALLET_REQUEST', 'sessionRef'],
  [{ outletRef: undefined }, 'INVALID_WALLET_REQUEST', 'outletRef'],
])('validates wallet input before any request (%#)', async (input, code, field) => {
  const { client, getAccessToken, transport } = setup();
  const error = await client.addWallet({ ...validInput, ...input }).catch(value => value);
  expect(error).toBeInstanceOf(TokenizationApiError);
  expect(error).toMatchObject({ status: 0, code });
  expect(error.message).toContain(field);
  expect(JSON.stringify(error)).not.toMatch(/private-value|encrypted bytes|session-1/);
  expect(getAccessToken).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});
