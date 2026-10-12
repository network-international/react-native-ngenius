const { createTokenizationClient } = require('../TokenizationClient');
const { TokenizationApiError } = require('../errors');

// Fixtures follow the examples in add-wallet-api.json.
const BASE_URL = 'https://tokenization.test';
const GOOGLE_PAY_TOKEN =
  '{"signature":"sig","intermediateSigningKey":{"signedKey":"k","signatures":["s"]},"protocolVersion":"ECv2","signedMessage":"msg"}';

const verifiedWallet = {
  tokenRef: 'tok_9',
  type: 'WALLET',
  status: 'VERIFIED',
  walletType: 'GOOGLE_PAY',
  cardDetails: { scheme: 'MASTERCARD', last4: '5100', expiry: '2029-06' },
  orderReference: 'ord-9',
  paymentReference: 'pay-9',
};

const awaitingWallet = {
  ...verifiedWallet,
  status: 'AWAIT_3DS',
  '3ds2': {
    threeDSServerTransID: '8a880dc0-d2d2-4067-bcb1-b08d1690b26e',
    threeDSMethodData: 'method-data',
    threeDSMethodNotificationURL: 'https://paypage.test/notification',
    messageVersion: '2.2.0',
  },
};

const jsonResponse = (status, body) => ({ status, text: JSON.stringify(body) });

describe('addWallet', () => {
  const calls = [];
  const createClient = (respond) =>
    createTokenizationClient({
      baseUrl: BASE_URL,
      getAccessToken: async () => 'test-access-token',
      transport: async (request) => {
        calls.push(request);
        return respond(request);
      },
    });

  beforeEach(() => {
    calls.length = 0;
  });

  it('posts walletType and the raw wallet token unchanged', async () => {
    const client = createClient(() => jsonResponse(200, verifiedWallet));
    await client.addWallet({
      outletRef: 'outlet-1',
      walletType: 'GOOGLE_PAY',
      encryptedPayload: GOOGLE_PAY_TOKEN,
    });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(`${BASE_URL}/api/outlets/outlet-1/wallets`);
    expect(calls[0].body).toEqual({
      walletType: 'GOOGLE_PAY',
      encryptedPayload: GOOGLE_PAY_TOKEN,
    });
    expect(calls[0].body.encryptedPayload).toBe(GOOGLE_PAY_TOKEN);
  });

  it('never sends merchantAttributes (force3DS does not apply to wallets)', async () => {
    const client = createClient(() => jsonResponse(200, verifiedWallet));
    await client.addWallet({
      outletRef: 'outlet-1',
      walletType: 'GOOGLE_PAY',
      encryptedPayload: GOOGLE_PAY_TOKEN,
      merchantAttributes: { force3DS: 'true' },
    });
    expect(calls[0].body).not.toHaveProperty('merchantAttributes');
  });

  it('returns VERIFIED wallets with walletType and card details', async () => {
    const client = createClient(() => jsonResponse(200, verifiedWallet));
    const result = await client.addWallet({
      outletRef: 'outlet-1',
      walletType: 'GOOGLE_PAY',
      encryptedPayload: GOOGLE_PAY_TOKEN,
    });
    expect(result).toMatchObject({
      tokenRef: 'tok_9',
      type: 'WALLET',
      walletType: 'GOOGLE_PAY',
      status: 'VERIFIED',
      cardDetails: { last4: '5100' },
    });
  });

  it('returns AWAIT_3DS with the continuation data for the shared 3DS endpoints', async () => {
    const client = createClient(() => jsonResponse(200, awaitingWallet));
    const result = await client.addWallet({
      outletRef: 'outlet-1',
      walletType: 'GOOGLE_PAY',
      encryptedPayload: GOOGLE_PAY_TOKEN,
    });
    expect(result.status).toBe('AWAIT_3DS');
    expect(result.threeDS2.step).toBe('METHOD');
    expect(result).toMatchObject({ orderReference: 'ord-9', paymentReference: 'pay-9' });
  });

  it.each([
    [{ walletType: 'SAMSUNG_PAY', encryptedPayload: GOOGLE_PAY_TOKEN }, 'walletType'],
    [{ walletType: 'GOOGLE_PAY', encryptedPayload: '' }, 'encryptedPayload'],
    [{ walletType: 'GOOGLE_PAY', encryptedPayload: { signature: 'sig' } }, 'encryptedPayload'],
  ])('rejects invalid input before sending (%#)', async (input, message) => {
    const client = createClient(() => jsonResponse(200, verifiedWallet));
    await expect(client.addWallet({ outletRef: 'outlet-1', ...input })).rejects.toThrow(message);
    expect(calls).toHaveLength(0);
  });

  it('maps walletVerificationFailed without echoing the wallet token', async () => {
    const client = createClient(() =>
      jsonResponse(422, {
        message: 'Unprocessable Entity',
        code: 422,
        errors: [
          {
            message: 'Wallet verification failed',
            localizedMessage: '{error.processing.walletVerificationFailed}',
            errorCode: 'walletVerificationFailed',
            domain: 'processing',
          },
        ],
      })
    );
    const error = await client
      .addWallet({ outletRef: 'outlet-1', walletType: 'GOOGLE_PAY', encryptedPayload: GOOGLE_PAY_TOKEN })
      .catch((e) => e);
    expect(error).toBeInstanceOf(TokenizationApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('walletVerificationFailed');
    expect(JSON.stringify(error)).not.toContain('signedMessage');
  });

  it('rejects a wallet response that is not typed as WALLET', async () => {
    const client = createClient(() =>
      jsonResponse(200, { ...verifiedWallet, type: 'WALLET', walletType: undefined })
    );
    const error = await client
      .addWallet({ outletRef: 'outlet-1', walletType: 'GOOGLE_PAY', encryptedPayload: GOOGLE_PAY_TOKEN })
      .catch((e) => e);
    expect(error.code).toBe('MALFORMED_RESPONSE');
  });
});
