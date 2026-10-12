const {
  createTokenizationClient,
  ACCESS_TOKEN_UNAVAILABLE,
} = require('../TokenizationClient');
const { TokenizationApiError } = require('../errors');
const { HEADER_ACCESS_TOKEN, HEADER_CONTENT_TYPE } = require('../headers');
const { TOKENIZATION_PATHS } = require('../endpoints');
const { parseSavedCardResponse } = require('../models');

// Fixtures follow the examples in add-card-api.json / saved-tokens-api.json.
const BASE_URL = 'https://tokenization.test';
const ACCESS_TOKEN = 'test-access-token';
const OUTLET = 'outlet-1';

const verifiedCard = {
  tokenRef: 'tok_1',
  type: 'CARD',
  status: 'VERIFIED',
  cardDetails: {
    scheme: 'VISA',
    last4: '1111',
    expiry: '2028-12',
    cardholderName: 'John Smith',
  },
  orderReference: 'ord-1',
  paymentReference: 'pay-1',
};

const methodStep = {
  ...verifiedCard,
  status: 'AWAIT_3DS',
  '3ds2': {
    threeDSMethodURL: 'https://acs.bank.test/3ds-method',
    threeDSServerTransID: '8a880dc0-d2d2-4067-bcb1-b08d1690b26e',
    threeDSMethodData: 'method-data',
    threeDSMethodNotificationURL: 'https://paypage.test/notification',
    messageVersion: '2.2.0',
  },
};

const challengeStep = {
  tokenRef: 'tok_1',
  type: 'CARD',
  status: 'AWAIT_3DS',
  orderReference: 'ord-1',
  paymentReference: 'pay-1',
  '3ds2': {
    threeDSServerTransID: '8a880dc0-d2d2-4067-bcb1-b08d1690b26e',
    acsTransID: 'd7c1ee99-9478-44a6-b1f2-391e29c6b340',
    acsURL: 'https://acs.bank.test/challenge',
    base64EncodedCReq: 'creq-value',
    transStatus: 'C',
    messageVersion: '2.2.0',
  },
};

const browserInfo = {
  browserAcceptHeader: 'application/json, text/plain, */*',
  browserJavaEnabled: false,
  browserJavascriptEnabled: true,
  browserLanguage: 'en-US',
  acceptBrowserLanguages: ['en-US', 'en'],
  browserColorDepth: '24',
  browserScreenHeight: '900',
  browserScreenWidth: '1440',
  browserTZ: '-240',
  browserUserAgent: 'Mozilla/5.0',
  challengeWindowSize: '05',
};

const threeDSIds = {
  outletRef: OUTLET,
  tokenRef: 'tok_1',
  orderReference: 'ord-1',
  paymentReference: 'pay-1',
};

const jsonResponse = (status, body) => ({
  status,
  text: body == null ? '' : JSON.stringify(body),
});

describe('TokenizationClient', () => {
  const calls = [];

  const createClient = ({ respond, getAccessToken, ...rest } = {}) =>
    createTokenizationClient({
      baseUrl: BASE_URL,
      getAccessToken: getAccessToken || (async () => ACCESS_TOKEN),
      transport: async (request) => {
        calls.push(request);
        return respond(request);
      },
      ...rest,
    });

  beforeEach(() => {
    calls.length = 0;
  });

  describe('configuration', () => {
    it('requires an explicit baseUrl and ships no environment defaults', () => {
      expect(() =>
        createTokenizationClient({ getAccessToken: async () => ACCESS_TOKEN })
      ).toThrow('baseUrl');
      expect(() =>
        createTokenizationClient({ environment: 'uat', getAccessToken: async () => ACCESS_TOKEN })
      ).toThrow('baseUrl');
    });

    it('requires an access-token provider instead of static credentials', () => {
      expect(() => createTokenizationClient({ baseUrl: BASE_URL })).toThrow('getAccessToken');
      expect(() =>
        createTokenizationClient({ baseUrl: BASE_URL, accessToken: ACCESS_TOKEN })
      ).toThrow('getAccessToken');
    });

    it('exposes only client-side contract operations', () => {
      const client = createClient({ respond: () => jsonResponse(200, { tokens: [] }) });
      expect(Object.keys(client).sort()).toEqual([
        'addWallet',
        'authenticateThreeDS',
        'getSavedTokens',
        'submitThreeDSChallengeResponse',
      ]);
    });
  });

  describe('Access-Token', () => {
    it('sends the provider token as Access-Token with JSON content type only', async () => {
      const client = createClient({ respond: () => jsonResponse(200, { tokens: [] }) });
      await client.getSavedTokens({ outletRef: OUTLET });
      expect(calls[0].headers).toEqual({
        [HEADER_ACCESS_TOKEN]: ACCESS_TOKEN,
        [HEADER_CONTENT_TYPE]: 'application/json',
      });
      const headerNames = Object.keys(calls[0].headers).map((name) => name.toLowerCase());
      expect(headerNames).not.toContain('authorization');
      expect(headerNames).not.toContain('x-api-key');
      expect(headerNames).not.toContain('idempotency-key');
      expect(headerNames).not.toContain('x-correlation-id');
      expect(JSON.stringify(calls[0].headers)).not.toMatch(/Bearer|Basic/);
    });

    it('asks the provider just in time for every request and keeps no copy', async () => {
      let counter = 0;
      const getAccessToken = jest.fn(async () => {
        counter += 1;
        return `token-${counter}`;
      });
      const client = createClient({
        getAccessToken,
        respond: () => jsonResponse(200, { tokens: [] }),
      });
      await client.getSavedTokens({ outletRef: OUTLET });
      await client.getSavedTokens({ outletRef: OUTLET });
      expect(getAccessToken).toHaveBeenCalledTimes(2);
      expect(calls.map((call) => call.headers[HEADER_ACCESS_TOKEN])).toEqual([
        'token-1',
        'token-2',
      ]);
      expect(JSON.stringify(client)).not.toContain('token-');
    });

    it.each([
      ['rejects', async () => { throw new Error('backend said secret-detail'); }],
      ['returns empty', async () => ''],
      ['returns non-string', async () => ({ token: ACCESS_TOKEN })],
    ])('fails safely without a request when the provider %s', async (_label, getAccessToken) => {
      const client = createClient({
        getAccessToken,
        respond: () => jsonResponse(200, { tokens: [] }),
      });
      const error = await client.getSavedTokens({ outletRef: OUTLET }).catch((e) => e);
      expect(error).toBeInstanceOf(TokenizationApiError);
      expect(error.code).toBe(ACCESS_TOKEN_UNAVAILABLE);
      expect(error.status).toBe(0);
      expect(JSON.stringify(error)).not.toContain('secret-detail');
      expect(calls).toHaveLength(0);
    });

    it('maps a 401 to a safe UNAUTHORIZED error without echoing the token', async () => {
      const client = createClient({
        respond: () => jsonResponse(401, { message: 'Unauthorized', code: 401, errors: [] }),
      });
      const error = await client.getSavedTokens({ outletRef: OUTLET }).catch((e) => e);
      expect(error.status).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
    });
  });

  describe('getSavedTokens', () => {
    it('builds the contract path with repeated tokens and consentOff', async () => {
      const client = createClient({ respond: () => jsonResponse(200, { tokens: [] }) });
      await client.getSavedTokens({
        outletRef: OUTLET,
        tokens: ['tok_1', 'tok_9'],
        consentOff: true,
      });
      expect(calls[0].method).toBe('GET');
      expect(calls[0].body).toBeUndefined();
      expect(calls[0].url).toBe(
        `${BASE_URL}/api/outlets/outlet-1/tokens?tokens=tok_1&tokens=tok_9&consentOff=true`
      );
    });

    it('omits optional query parameters that were not provided', async () => {
      const client = createClient({ respond: () => jsonResponse(200, { tokens: [] }) });
      await client.getSavedTokens({ outletRef: 'outlet 1/a' });
      expect(calls[0].url).toBe(`${BASE_URL}/api/outlets/outlet%201%2Fa/tokens`);
      await client.getSavedTokens({ outletRef: OUTLET, consentOff: false });
      expect(calls[1].url).toBe(`${BASE_URL}/api/outlets/outlet-1/tokens?consentOff=false`);
    });

    it('treats zero tokens with a tncUrl as a valid first-time response', async () => {
      const client = createClient({
        respond: () => jsonResponse(200, { tokens: [], tncUrl: 'https://merchant.test/terms' }),
      });
      await expect(client.getSavedTokens({ outletRef: OUTLET })).resolves.toEqual({
        tokens: [],
        tncUrl: 'https://merchant.test/terms',
      });
    });

    it('ignores tncUrl when consent is turned off', async () => {
      const client = createClient({
        respond: () => jsonResponse(200, { tokens: [], tncUrl: 'https://merchant.test/terms' }),
      });
      await expect(
        client.getSavedTokens({ outletRef: OUTLET, consentOff: true })
      ).resolves.toEqual({ tokens: [] });
    });

    it('parses VERIFIED, AWAIT_3DS and FAILED tokens including wallets', async () => {
      const client = createClient({
        respond: () =>
          jsonResponse(200, {
            tokens: [
              verifiedCard,
              { tokenRef: 'tok_2', type: 'CARD', status: 'AWAIT_3DS' },
              {
                tokenRef: 'tok_3',
                type: 'WALLET',
                walletType: 'GOOGLE_PAY',
                status: 'FAILED',
                cardDetails: { scheme: 'MASTERCARD', last4: '4444', expiry: '2030-01' },
              },
            ],
          }),
      });
      const { tokens } = await client.getSavedTokens({ outletRef: OUTLET });
      expect(tokens.map((token) => token.status)).toEqual(['VERIFIED', 'AWAIT_3DS', 'FAILED']);
      expect(tokens[2]).toMatchObject({ type: 'WALLET', walletType: 'GOOGLE_PAY' });
      expect(tokens[1].cardDetails).toBeNull();
    });

    it('rejects invalid tokenRef query values before any request', async () => {
      const client = createClient({ respond: () => jsonResponse(200, { tokens: [] }) });
      await expect(
        client.getSavedTokens({ outletRef: OUTLET, tokens: ['tok 1'] })
      ).rejects.toThrow('invalid tokenRef');
      await expect(client.getSavedTokens({ outletRef: '' })).rejects.toThrow('outletRef');
      expect(calls).toHaveLength(0);
    });

    it('maps malformed list bodies to MALFORMED_RESPONSE', async () => {
      const client = createClient({ respond: () => jsonResponse(200, { tncUrl: 'x' }) });
      const error = await client.getSavedTokens({ outletRef: OUTLET }).catch((e) => e);
      expect(error.code).toBe('MALFORMED_RESPONSE');
    });
  });

  describe('3DS continuation', () => {
    it('posts authentications with deviceChannel BRW and the token-scoped path', async () => {
      const client = createClient({ respond: () => jsonResponse(200, challengeStep) });
      const result = await client.authenticateThreeDS({
        ...threeDSIds,
        threeDSCompInd: 'Y',
        browserInfo: { ...browserInfo, unexpected: 'dropped' },
      });
      expect(calls[0].method).toBe('POST');
      expect(calls[0].url).toBe(
        `${BASE_URL}/api/outlets/outlet-1/tokens/tok_1/orders/ord-1/payments/pay-1/3ds2/authentications`
      );
      expect(calls[0].body).toEqual({ deviceChannel: 'BRW', threeDSCompInd: 'Y', browserInfo });
      expect(result.status).toBe('AWAIT_3DS');
      expect(result.threeDS2.step).toBe('CHALLENGE');
      expect(result.cardDetails).toBeNull();
    });

    it('posts the challenge response and returns VERIFIED', async () => {
      const client = createClient({ respond: () => jsonResponse(200, verifiedCard) });
      const result = await client.submitThreeDSChallengeResponse({
        ...threeDSIds,
        base64EncodedCRes: 'cres-value',
      });
      expect(calls[0].url).toBe(
        `${BASE_URL}/api/outlets/outlet-1/tokens/tok_1/orders/ord-1/payments/pay-1/3ds2/challenge-response`
      );
      expect(calls[0].body).toEqual({ base64EncodedCRes: 'cres-value' });
      expect(result.status).toBe('VERIFIED');
    });

    it('validates references and inputs before sending', async () => {
      const client = createClient({ respond: () => jsonResponse(200, verifiedCard) });
      await expect(
        client.authenticateThreeDS({ ...threeDSIds, tokenRef: 'tok/1', threeDSCompInd: 'Y', browserInfo })
      ).rejects.toThrow('tokenRef is invalid');
      await expect(
        client.authenticateThreeDS({ ...threeDSIds, threeDSCompInd: 'X', browserInfo })
      ).rejects.toThrow('threeDSCompInd');
      await expect(
        client.submitThreeDSChallengeResponse({ ...threeDSIds, base64EncodedCRes: '' })
      ).rejects.toThrow('base64EncodedCRes');
      expect(calls).toHaveLength(0);
    });

    it('rejects an AWAIT_3DS continuation without references or 3ds2 data', async () => {
      const client = createClient({
        respond: () => jsonResponse(200, { ...challengeStep, '3ds2': undefined }),
      });
      const error = await client
        .authenticateThreeDS({ ...threeDSIds, threeDSCompInd: 'U', browserInfo })
        .catch((e) => e);
      expect(error.code).toBe('MALFORMED_RESPONSE');
    });

    it('maps 422 cardVerificationFailed to a typed error', async () => {
      const client = createClient({
        respond: () =>
          jsonResponse(422, {
            message: 'Unprocessable Entity',
            code: 422,
            errors: [
              {
                message: 'Card verification failed',
                localizedMessage: '{error.processing.cardVerificationFailed}',
                errorCode: 'cardVerificationFailed',
                domain: 'processing',
              },
            ],
          }),
      });
      const error = await client
        .submitThreeDSChallengeResponse({ ...threeDSIds, base64EncodedCRes: 'cres-value' })
        .catch((e) => e);
      expect(error).toBeInstanceOf(TokenizationApiError);
      expect(error.status).toBe(422);
      expect(error.code).toBe('cardVerificationFailed');
      expect(error.errors[0].domain).toBe('processing');
      expect(JSON.stringify(error)).not.toContain('cres-value');
    });
  });

  describe('errors', () => {
    it('reads the backend error body and keeps only documented fields', async () => {
      const client = createClient({
        respond: () =>
          jsonResponse(400, {
            message: 'Bad Request',
            code: 400,
            errors: [
              {
                message: 'Invalid walletType',
                localizedMessage: '{error.processing.invalidWalletType}',
                errorCode: 'invalidWalletType',
                domain: 'processing',
                encryptedPayload: 'leaked-payload',
              },
            ],
            card: { pan: '4111111111111111' },
          }),
      });
      const error = await client.getSavedTokens({ outletRef: OUTLET }).catch((e) => e);
      expect(error.code).toBe('invalidWalletType');
      expect(error.message).toBe('Bad Request');
      expect(error.errors).toEqual([
        {
          message: 'Invalid walletType',
          localizedMessage: '{error.processing.invalidWalletType}',
          errorCode: 'invalidWalletType',
          domain: 'processing',
        },
      ]);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain('leaked-payload');
      expect(serialized).not.toContain('4111111111111111');
    });

    it('falls back by HTTP status when the error body is not documented', async () => {
      const client = createClient({ respond: () => jsonResponse(500, undefined) });
      const error = await client.getSavedTokens({ outletRef: OUTLET }).catch((e) => e);
      expect(error.status).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('maps non-JSON bodies to MALFORMED_RESPONSE', async () => {
      const client = createClient({ respond: () => ({ status: 502, text: '<html>' }) });
      const error = await client.getSavedTokens({ outletRef: OUTLET }).catch((e) => e);
      expect(error.code).toBe('MALFORMED_RESPONSE');
      expect(error.status).toBe(502);
    });

    it('maps transport failures to NETWORK_ERROR without the request', async () => {
      const client = createClient({
        respond: () => {
          throw new Error(`failed ${ACCESS_TOKEN}`);
        },
      });
      const error = await client.getSavedTokens({ outletRef: OUTLET }).catch((e) => e);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
    });
  });

  describe('fetch transport', () => {
    it('sends JSON over fetch and reads the response text', async () => {
      const fetchImpl = jest.fn(async () => ({
        status: 200,
        text: async () => JSON.stringify({ tokens: [] }),
      }));
      const client = createTokenizationClient({
        baseUrl: `${BASE_URL}/`,
        getAccessToken: async () => ACCESS_TOKEN,
        fetchImpl,
      });
      await client.getSavedTokens({ outletRef: OUTLET });
      expect(fetchImpl).toHaveBeenCalledWith(`${BASE_URL}/api/outlets/outlet-1/tokens`, {
        method: 'GET',
        headers: {
          [HEADER_ACCESS_TOKEN]: ACCESS_TOKEN,
          [HEADER_CONTENT_TYPE]: 'application/json',
        },
      });
    });
  });
});

describe('add card contract (native submission)', () => {
  it('models the card path without a JS card operation', () => {
    expect(TOKENIZATION_PATHS.addCard({ outletRef: OUTLET })).toBe('/api/outlets/outlet-1/cards');
  });

  it('accepts non-UUID token references as documented', () => {
    expect(parseSavedCardResponse(verifiedCard).tokenRef).toBe('tok_1');
  });
});

describe('SavedCardResponse model', () => {
  it('parses the method-step AWAIT_3DS response from add card', () => {
    const parsed = parseSavedCardResponse(methodStep, { requireContinuation: true });
    expect(parsed).toMatchObject({
      tokenRef: 'tok_1',
      type: 'CARD',
      walletType: null,
      status: 'AWAIT_3DS',
      orderReference: 'ord-1',
      paymentReference: 'pay-1',
    });
    expect(parsed.threeDS2).toEqual({ step: 'METHOD', ...methodStep['3ds2'] });
  });

  it('accepts a method step without threeDSMethodURL (threeDSCompInd U)', () => {
    const { threeDSMethodURL, ...withoutUrl } = methodStep['3ds2'];
    const parsed = parseSavedCardResponse(
      { ...methodStep, '3ds2': withoutUrl },
      { requireContinuation: true }
    );
    expect(parsed.threeDS2.step).toBe('METHOD');
    expect(parsed.threeDS2.threeDSMethodURL).toBeUndefined();
  });

  it.each([
    ['unknown status', { ...verifiedCard, status: 'ACTIVE' }],
    ['unknown type', { ...verifiedCard, type: 'BANK' }],
    ['walletType on a card', { ...verifiedCard, walletType: 'GOOGLE_PAY' }],
    ['wallet without walletType', { ...verifiedCard, type: 'WALLET' }],
    ['VERIFIED without cardDetails', { ...verifiedCard, cardDetails: undefined }],
    ['malformed last4', { ...verifiedCard, cardDetails: { ...verifiedCard.cardDetails, last4: '11' } }],
    ['malformed expiry', { ...verifiedCard, cardDetails: { ...verifiedCard.cardDetails, expiry: '12/28' } }],
    ['3ds2 on VERIFIED', { ...verifiedCard, '3ds2': methodStep['3ds2'] }],
    ['incomplete challenge', { ...challengeStep, '3ds2': { ...challengeStep['3ds2'], base64EncodedCReq: undefined } }],
    ['invalid tokenRef', { ...verifiedCard, tokenRef: 'tok 1' }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseSavedCardResponse(value)).toThrow();
  });
});
