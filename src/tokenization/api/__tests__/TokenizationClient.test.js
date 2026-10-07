const {
  createTokenizationClient,
} = require('../TokenizationClient');
const { TokenizationApiError } = require('../errors');
const {
  TOKENIZATION_MEDIA_TYPE,
  HEADER_ACCEPT,
  HEADER_CONTENT_TYPE,
  HEADER_AUTHORIZATION,
  HEADER_API_KEY,
  HEADER_CORRELATION_ID,
  HEADER_IDEMPOTENCY_KEY,
} = require('../headers');
const { TOKENIZATION_ENVIRONMENTS } = require('../environments');
const { redactSensitive } = require('../redact');
const {
  mapCreateCardRequest,
  mapCreateWalletRequest,
} = require('../models');
const { inspectNativeWalletForCreateRequest } = require('../nativeCreateBlockers');

const DUMMY_JWT = 'test-access-token';
const DUMMY_API_KEY = 'test-restricted-key';
const OUTLET = 'outlet 123';
const CONSUMER = 'consumer/456';
const TOKEN_REF = '550e8400-e29b-41d4-a716-446655440000';

const paymentMethod = {
  tokenRef: TOKEN_REF,
  type: 'CARD',
  scheme: 'VISA',
  walletType: null,
  last4digits: '4242',
  expiry: '2033-01',
  status: 'ACTIVE',
};

const jsonResponse = (status, body, extraHeaders) => ({
  status,
  headers: {
    [HEADER_CORRELATION_ID]: 'corr-from-header',
    ...extraHeaders,
  },
  text: body == null ? '' : JSON.stringify(body),
});

describe('TokenizationClient', () => {
  const calls = [];

  const createClient = (overrides) =>
    createTokenizationClient({
      environment: 'uat',
      getAuth: async () => ({
        accessToken: DUMMY_JWT,
        apiKey: DUMMY_API_KEY,
      }),
      transport: async (request) => {
        calls.push(request);
        return overrides.respond(request);
      },
      ...overrides.client,
    });

  beforeEach(() => {
    calls.length = 0;
  });

  it('encodes outletId, consumerId, and tokenRef in the path', async () => {
    const client = createClient({
      respond: () => jsonResponse(200, paymentMethod),
    });
    await client.getPaymentMethod({
      outletId: OUTLET,
      consumerId: CONSUMER,
      tokenRef: TOKEN_REF,
    });
    expect(calls[0].url).toBe(
      `${TOKENIZATION_ENVIRONMENTS.uat}/outlets/${encodeURIComponent(
        OUTLET
      )}/consumers/${encodeURIComponent(CONSUMER)}/payment-methods/${encodeURIComponent(
        TOKEN_REF
      )}`
    );
  });

  it('uses the production base URL when environment is production', async () => {
    const client = createTokenizationClient({
      environment: 'production',
      getAuth: async () => ({ accessToken: DUMMY_JWT, apiKey: DUMMY_API_KEY }),
      transport: async (request) => {
        calls.push(request);
        return jsonResponse(200, { paymentMethods: [] });
      },
    });
    await client.listPaymentMethods({ outletId: 'o', consumerId: 'c' });
    expect(calls[0].url.startsWith(TOKENIZATION_ENVIRONMENTS.production)).toBe(
      true
    );
  });

  it('sends V1 Accept on every request and Content-Type only when there is a body', async () => {
    const client = createClient({
      respond: (request) => {
        if (request.method === 'GET') {
          return jsonResponse(200, { paymentMethods: [paymentMethod] });
        }
        return jsonResponse(200, { valid: true, ...paymentMethod });
      },
    });
    await client.listPaymentMethods({ outletId: 'o', consumerId: 'c' });
    expect(calls[0].headers[HEADER_ACCEPT]).toBe(TOKENIZATION_MEDIA_TYPE);
    expect(calls[0].headers[HEADER_CONTENT_TYPE]).toBeUndefined();

    await client.validatePaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      tokenRef: TOKEN_REF,
    });
    expect(calls[1].headers[HEADER_ACCEPT]).toBe(TOKENIZATION_MEDIA_TYPE);
    expect(calls[1].headers[HEADER_CONTENT_TYPE]).toBeUndefined();
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toMatch(/\/validate$/);
  });

  it('sends Authorization Bearer and X-API-Key from the auth provider', async () => {
    const client = createClient({
      respond: () => jsonResponse(200, { paymentMethods: [] }),
    });
    await client.listPaymentMethods({ outletId: 'o', consumerId: 'c' });
    expect(calls[0].headers[HEADER_AUTHORIZATION]).toBe(`Bearer ${DUMMY_JWT}`);
    expect(calls[0].headers[HEADER_API_KEY]).toBe(DUMMY_API_KEY);
  });

  it('omits X-API-Key when the auth provider does not supply apiKey', async () => {
    const client = createTokenizationClient({
      environment: 'uat',
      getAuth: async () => ({ accessToken: DUMMY_JWT }),
      transport: async (request) => {
        calls.push(request);
        return jsonResponse(200, { paymentMethods: [] });
      },
    });
    await client.listPaymentMethods({ outletId: 'o', consumerId: 'c' });
    expect(calls[0].headers[HEADER_API_KEY]).toBeUndefined();
  });

  it('sends X-Correlation-Id when provided', async () => {
    const client = createClient({
      respond: () => jsonResponse(200, { paymentMethods: [] }),
    });
    await client.listPaymentMethods({
      outletId: 'o',
      consumerId: 'c',
      correlationId: 'corr-1',
    });
    expect(calls[0].headers[HEADER_CORRELATION_ID]).toBe('corr-1');
  });

  it('reuses one Idempotency-Key for retries of the same create operation', async () => {
    const client = createClient({
      respond: () => jsonResponse(201, paymentMethod),
    });
    const request = {
      pan: '4111111111111111',
      expiry: '2033-01',
      cvv: '123',
      scheme: 'VISA',
    };
    await client.createCardPaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      operationId: 'add-card',
      request,
    });
    await client.createCardPaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      operationId: 'add-card',
      request,
    });
    expect(calls[0].headers[HEADER_IDEMPOTENCY_KEY]).toBe(
      calls[1].headers[HEADER_IDEMPOTENCY_KEY]
    );
    expect(calls[0].headers[HEADER_CONTENT_TYPE]).toBe(TOKENIZATION_MEDIA_TYPE);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toMatch(/\/payment-methods\/card$/);
  });

  it('uses a caller-supplied Idempotency-Key and does not reuse keys across operations', async () => {
    const client = createClient({
      respond: () => jsonResponse(201, paymentMethod),
    });
    const request = {
      pan: '4111111111111111',
      expiry: '2033-01',
      cvv: '123',
      scheme: 'VISA',
    };
    await client.createCardPaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      idempotencyKey: 'explicit-key-1',
      request,
    });
    await client.createCardPaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      request,
    });
    await client.createCardPaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      request,
    });
    expect(calls[0].headers[HEADER_IDEMPOTENCY_KEY]).toBe('explicit-key-1');
    expect(calls[1].headers[HEADER_IDEMPOTENCY_KEY]).not.toBe(
      calls[2].headers[HEADER_IDEMPOTENCY_KEY]
    );
    expect(calls[1].headers[HEADER_IDEMPOTENCY_KEY]).not.toBe('explicit-key-1');
  });

  it('does not send Idempotency-Key on list/get/validate/delete', async () => {
    const client = createClient({
      respond: (request) => {
        if (request.method === 'DELETE') {
          return { status: 204, headers: {}, text: '' };
        }
        if (String(request.url).endsWith('/validate')) {
          return jsonResponse(200, { valid: true, ...paymentMethod });
        }
        if (request.method === 'GET' && String(request.url).indexOf(TOKEN_REF) !== -1) {
          return jsonResponse(200, paymentMethod);
        }
        return jsonResponse(200, { paymentMethods: [] });
      },
    });
    await client.listPaymentMethods({ outletId: 'o', consumerId: 'c' });
    await client.getPaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      tokenRef: TOKEN_REF,
    });
    await client.validatePaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      tokenRef: TOKEN_REF,
    });
    await client.deletePaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      tokenRef: TOKEN_REF,
    });
    calls.forEach((call) => {
      expect(call.headers[HEADER_IDEMPOTENCY_KEY]).toBeUndefined();
    });
  });

  it('calls getAuth on every operation and does not cache the token', async () => {
    const getAuth = jest.fn(async () => ({
      accessToken: DUMMY_JWT,
      apiKey: DUMMY_API_KEY,
    }));
    const client = createTokenizationClient({
      environment: 'uat',
      getAuth,
      transport: async (request) => {
        calls.push(request);
        return jsonResponse(200, { paymentMethods: [] });
      },
    });
    await client.listPaymentMethods({ outletId: 'o', consumerId: 'c' });
    await client.listPaymentMethods({ outletId: 'o', consumerId: 'c' });
    expect(getAuth).toHaveBeenCalledTimes(2);
  });

  it('surfaces missing auth as TokenizationApiError without leaking credentials', async () => {
    const client = createTokenizationClient({
      environment: 'uat',
      getAuth: async () => ({ accessToken: '' }),
      transport: async () => jsonResponse(200, { paymentMethods: [] }),
    });
    let caught;
    try {
      await client.listPaymentMethods({ outletId: 'o', consumerId: 'c' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TokenizationApiError);
    expect(caught.code).toBe('UNAUTHORIZED');
    expect(JSON.stringify(caught.toJSON())).not.toMatch(DUMMY_JWT);
  });

  it('rejects a 201 missing required PaymentMethodResponse fields', async () => {
    const client = createClient({
      respond: () =>
        jsonResponse(201, {
          tokenRef: TOKEN_REF,
          type: 'CARD',
          usageType: 'UNSCHEDULED',
          authType: 'VERIFY',
        }),
    });
    await expect(
      client.createCardPaymentMethod({
        outletId: 'o',
        consumerId: 'c',
        operationId: 'add-card-invalid',
        request: {
          pan: '4111111111111111',
          expiry: '2033-01',
          cvv: '123',
          scheme: 'VISA',
        },
      })
    ).rejects.toMatchObject({
      name: 'TokenizationApiError',
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('drops unknown V1 fields such as usageType from a valid response', async () => {
    const client = createClient({
      respond: () =>
        jsonResponse(200, {
          ...paymentMethod,
          usageType: 'UNSCHEDULED',
          authType: 'VERIFY',
        }),
    });
    const result = await client.getPaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      tokenRef: TOKEN_REF,
    });
    expect(result).toEqual(paymentMethod);
    expect(result).not.toHaveProperty('usageType');
    expect(result).not.toHaveProperty('authType');
  });

  it('models POST /wallet without treating Google Pay token as DAN', async () => {
    const client = createClient({
      respond: () =>
        jsonResponse(201, {
          ...paymentMethod,
          type: 'WALLET',
          walletType: 'GOOGLE_PAY',
        }),
    });
    await client.createWalletPaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      operationId: 'add-wallet',
      request: {
        walletType: 'GOOGLE_PAY',
        dan: 'dummy-dan',
        onlinePaymentCryptogram: 'dummy-cryptogram',
        expiry: '2033-01',
        scheme: 'VISA',
      },
    });
    expect(calls[0].url).toMatch(/\/payment-methods\/wallet$/);
    expect(calls[0].headers[HEADER_IDEMPOTENCY_KEY]).toBeTruthy();
    expect(calls[0].body.dan).toBe('dummy-dan');
    expect(calls[0].body).not.toHaveProperty('token');
  });

  it('parses PaymentMethodListResponse', async () => {
    const client = createClient({
      respond: () => jsonResponse(200, { paymentMethods: [paymentMethod] }),
    });
    const result = await client.listPaymentMethods({
      outletId: 'o',
      consumerId: 'c',
    });
    expect(result).toEqual({ paymentMethods: [paymentMethod] });
    expect(result.paymentMethods[0]).not.toHaveProperty('usageType');
    expect(result.paymentMethods[0]).not.toHaveProperty('authType');
  });

  it('parses PaymentMethodResponse', async () => {
    const client = createClient({
      respond: () => jsonResponse(200, paymentMethod),
    });
    await expect(
      client.getPaymentMethod({
        outletId: 'o',
        consumerId: 'c',
        tokenRef: TOKEN_REF,
      })
    ).resolves.toEqual(paymentMethod);
  });

  it('parses ValidatePaymentMethodResponse', async () => {
    const client = createClient({
      respond: () => jsonResponse(200, { valid: true, ...paymentMethod }),
    });
    await expect(
      client.validatePaymentMethod({
        outletId: 'o',
        consumerId: 'c',
        tokenRef: TOKEN_REF,
      })
    ).resolves.toEqual({ valid: true, ...paymentMethod });
  });

  it('treats delete 204 as success with no PaymentMethodResponse', async () => {
    const client = createClient({
      respond: () => ({
        status: 204,
        headers: { [HEADER_CORRELATION_ID]: 'corr-del' },
        text: '',
      }),
    });
    const result = await client.deletePaymentMethod({
      outletId: 'o',
      consumerId: 'c',
      tokenRef: TOKEN_REF,
    });
    expect(result).toEqual({ correlationId: 'corr-del' });
    expect(calls[0].method).toBe('DELETE');
  });

  const errorCases = [
    [
      400,
      {
        code: 'INVALID_REQUEST',
        message: 'Invalid card expiry format or unsupported scheme',
        correlationId: 'c-400',
      },
    ],
    [
      401,
      {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Bearer JWT token',
        correlationId: 'c-401',
      },
    ],
    [
      403,
      {
        code: 'FORBIDDEN',
        message:
          'Caller is not authorized to access payment methods for this outlet/consumer',
        correlationId: 'c-403',
      },
    ],
    [
      404,
      {
        code: 'PAYMENT_METHOD_NOT_FOUND',
        message: 'Payment method was not found for the supplied consumer',
        correlationId: 'c-404',
      },
    ],
    [
      409,
      {
        code: 'DUPLICATE_IDEMPOTENCY_KEY',
        message:
          'A request with this Idempotency-Key is currently being processed or already succeeded',
        correlationId: 'c-409',
      },
    ],
    [
      422,
      {
        code: 'VERIFICATION_FAILED',
        message: 'Card verification order was declined by payment gateway',
        correlationId: 'c-422',
      },
    ],
    [
      502,
      {
        code: 'DEPENDENCY_ERROR',
        message: 'Downstream vault or transaction service failed to respond',
        correlationId: 'c-502',
      },
    ],
    [
      500,
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred while processing the request',
        correlationId: 'c-500',
      },
    ],
  ];

  errorCases.forEach(([status, body]) => {
    it(`surfaces ErrorResponse for HTTP ${status}`, async () => {
      const client = createClient({
        respond: () => jsonResponse(status, body),
      });
      let caught;
      try {
        await client.getPaymentMethod({
          outletId: 'o',
          consumerId: 'c',
          tokenRef: TOKEN_REF,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(TokenizationApiError);
      expect(caught.status).toBe(status);
      expect(caught.code).toBe(body.code);
      expect(caught.message).toBe(body.message);
      expect(caught.correlationId).toBe(body.correlationId);
      const serialized = JSON.stringify(caught.toJSON());
      expect(serialized).not.toMatch(/411111/);
      expect(serialized).not.toMatch(DUMMY_JWT);
      expect(serialized).not.toMatch(DUMMY_API_KEY);
    });
  });

  it('handles malformed non-JSON error bodies without leaking payloads', async () => {
    const client = createClient({
      respond: () => ({
        status: 500,
        headers: { [HEADER_CORRELATION_ID]: 'corr-bad' },
        text: '<html>nope</html>',
      }),
    });
    await expect(
      client.listPaymentMethods({ outletId: 'o', consumerId: 'c' })
    ).rejects.toMatchObject({
      name: 'TokenizationApiError',
      code: 'MALFORMED_RESPONSE',
      correlationId: 'corr-bad',
    });
  });

  it('does not include auth headers in redacted diagnostics', () => {
    const redacted = redactSensitive({
      Authorization: `Bearer ${DUMMY_JWT}`,
      'X-API-Key': DUMMY_API_KEY,
      pan: '4111111111111111',
      cvv: '123',
      dan: 'wallet-dan',
      onlinePaymentCryptogram: 'crypto',
      token: 'google-pay-token',
    });
    expect(JSON.stringify(redacted)).not.toMatch(DUMMY_JWT);
    expect(JSON.stringify(redacted)).not.toMatch(DUMMY_API_KEY);
    expect(JSON.stringify(redacted)).not.toMatch('411111');
    expect(JSON.stringify(redacted)).not.toMatch('wallet-dan');
    expect(redacted.pan).toBe('[REDACTED]');
  });
});

describe('create request mapping', () => {
  it('maps CreateCardRequest schema fields without inventing extras', () => {
    const body = mapCreateCardRequest({
      pan: '4111111111111111',
      expiry: '2033-01',
      cvv: '123',
      scheme: 'VISA',
      cardholderName: 'Jane Merchant',
    });
    expect(body).toEqual({
      pan: '4111111111111111',
      expiry: '2033-01',
      cvv: '123',
      scheme: 'VISA',
      cardholderName: 'Jane Merchant',
    });
    expect(body).not.toHaveProperty('order');
  });

  it('maps CreateWalletRequest schema fields when they are actually supplied', () => {
    const body = mapCreateWalletRequest({
      walletType: 'APPLE_PAY',
      dan: 'dummy-dan',
      onlinePaymentCryptogram: 'dummy-cryptogram',
      expiry: '2033-01',
      scheme: 'VISA',
      eciIndicator: '05',
    });
    expect(body.walletType).toBe('APPLE_PAY');
    expect(body.scheme).toBe('VISA');
    expect(body.eciIndicator).toBe('05');
    expect(body).not.toHaveProperty('order');
  });

  it('does not treat native Apple Pay or Google Pay results as CreateWalletRequest', () => {
    expect(
      inspectNativeWalletForCreateRequest({ status: 'Success' }).mappable
    ).toBe(false);
    expect(
      inspectNativeWalletForCreateRequest({
        status: 'Success',
        token: 'google-pay-gateway-token',
      }).mappable
    ).toBe(false);
  });

  it('does not pass a SALE order as VERIFY OrderContext', () => {
    const sale = { action: 'SALE', reference: 'ord_1' };
    expect(() =>
      mapCreateCardRequest({
        pan: '4111111111111111',
        expiry: '2033-01',
        cvv: '123',
        scheme: 'VISA',
      })
    ).not.toThrow();
    const withOrder = mapCreateCardRequest({
      pan: '4111111111111111',
      expiry: '2033-01',
      cvv: '123',
      scheme: 'VISA',
      order: sale,
    });
    expect(withOrder.order).toEqual(sale);
  });
});
