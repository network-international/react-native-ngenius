const { runGooglePayTokenization } = require('../walletTokenization');
const { createTokenizationClient } = require('../api/TokenizationClient');
const { VERIFICATION_STATES } = require('../verificationStates');

const GOOGLE_PAY_TOKEN = '{"signature":"sig","protocolVersion":"ECv2","signedMessage":"msg"}';
const order = { amount: { value: 100, currencyCode: 'AED' } };
const googlePayConfig = { merchantName: 'Demo', gateway: 'networkintl', gatewayMerchantId: 'm' };

const verified = {
  tokenRef: 'tok_9',
  type: 'WALLET',
  walletType: 'GOOGLE_PAY',
  status: 'VERIFIED',
  cardDetails: { scheme: 'MASTERCARD', last4: '5100', expiry: '2029-06' },
  orderReference: 'ord-9',
  paymentReference: 'pay-9',
};
const awaiting = {
  ...verified,
  status: 'AWAIT_3DS',
  '3ds2': {
    threeDSServerTransID: '8a880dc0-d2d2-4067-bcb1-b08d1690b26e',
    threeDSMethodData: 'method-data',
    threeDSMethodNotificationURL: 'https://paypage.test/notification',
    messageVersion: '2.2.0',
  },
};

const setup = ({ respond, native } = {}) => {
  const calls = [];
  const client = createTokenizationClient({
    baseUrl: 'https://tokenization.test',
    getAccessToken: async () => 'test-access-token',
    transport: async (request) => {
      calls.push(request);
      return respond(request);
    },
  });
  const initiateGooglePay = jest.fn(
    native || (async () => ({ status: 'Success', token: GOOGLE_PAY_TOKEN }))
  );
  const onVerifying = jest.fn();
  const run = () =>
    runGooglePayTokenization({
      client,
      outletRef: 'outlet-1',
      order,
      googlePayConfig,
      initiateGooglePay,
      onVerifying,
    });
  return { calls, initiateGooglePay, onVerifying, run };
};

const json = (status, body) => ({ status, text: JSON.stringify(body) });

describe('Google Pay tokenization slice', () => {
  it('sends the Google Pay token unchanged and succeeds only on VERIFIED', async () => {
    const { calls, initiateGooglePay, onVerifying, run } = setup({
      respond: () => json(200, verified),
    });
    const outcome = await run();
    expect(initiateGooglePay).toHaveBeenCalledWith(order, googlePayConfig);
    expect(onVerifying).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://tokenization.test/api/outlets/outlet-1/wallets');
    expect(calls[0].body).toEqual({ walletType: 'GOOGLE_PAY', encryptedPayload: GOOGLE_PAY_TOKEN });
    expect(outcome.state).toBe(VERIFICATION_STATES.SUCCESS);
    expect(outcome.result).toMatchObject({
      method: 'GOOGLE_PAY',
      status: 'VERIFIED',
      niTokenCreated: true,
      savedToken: { tokenRef: 'tok_9', walletType: 'GOOGLE_PAY' },
    });
    expect(JSON.stringify(outcome)).not.toContain('signedMessage');
  });

  it('ends AWAIT_3DS in a controlled pending state without exposing the token', async () => {
    const { run } = setup({ respond: () => json(200, awaiting) });
    const outcome = await run();
    expect(outcome.state).toBe(VERIFICATION_STATES.AWAITING_3DS);
    expect(outcome.result).toMatchObject({
      status: 'AWAIT_3DS',
      code: 'THREE_DS_CONTINUATION_UNAVAILABLE',
      niTokenCreated: false,
      savedToken: null,
    });
    expect(JSON.stringify(outcome)).not.toContain('tok_9');
  });

  it('treats a FAILED wallet as failure', async () => {
    const { run } = setup({ respond: () => json(200, { ...verified, status: 'FAILED' }) });
    const outcome = await run();
    expect(outcome.state).toBe(VERIFICATION_STATES.FAILED);
    expect(outcome.result.niTokenCreated).toBe(false);
  });

  it('maps 422 walletVerificationFailed to a failure result', async () => {
    const { run } = setup({
      respond: () =>
        json(422, {
          message: 'Unprocessable Entity',
          code: 422,
          errors: [{ errorCode: 'walletVerificationFailed', domain: 'processing' }],
        }),
    });
    const outcome = await run();
    expect(outcome.state).toBe(VERIFICATION_STATES.FAILED);
    expect(outcome.result.code).toBe('walletVerificationFailed');
  });

  it('returns to READY without a request when the shopper aborts the sheet', async () => {
    const { calls, onVerifying, run } = setup({
      respond: () => json(200, verified),
      native: async () => {
        throw { status: 'Aborted', error: 'User cancelled' };
      },
    });
    const outcome = await run();
    expect(outcome).toEqual({ state: VERIFICATION_STATES.READY });
    expect(calls).toHaveLength(0);
    expect(onVerifying).not.toHaveBeenCalled();
  });

  it.each([
    ['native failure', async () => { throw { status: 'Failed', error: GOOGLE_PAY_TOKEN }; }, 'WALLET_CAPTURE_FAILED'],
    ['missing token', async () => ({ status: 'Success' }), 'WALLET_TOKEN_MISSING'],
  ])('fails safely on %s without calling the backend', async (_label, native, code) => {
    const { calls, run } = setup({ respond: () => json(200, verified), native });
    const outcome = await run();
    expect(outcome.state).toBe(VERIFICATION_STATES.FAILED);
    expect(outcome.result.code).toBe(code);
    expect(calls).toHaveLength(0);
    expect(JSON.stringify(outcome)).not.toContain('signedMessage');
  });

  it('fails safely when the access token is unavailable', async () => {
    const calls = [];
    const client = createTokenizationClient({
      baseUrl: 'https://tokenization.test',
      getAccessToken: async () => {
        throw new Error('merchant backend down');
      },
      transport: async (request) => {
        calls.push(request);
        return json(200, verified);
      },
    });
    const outcome = await runGooglePayTokenization({
      client,
      outletRef: 'outlet-1',
      order,
      googlePayConfig,
      initiateGooglePay: async () => ({ status: 'Success', token: GOOGLE_PAY_TOKEN }),
    });
    expect(outcome.state).toBe(VERIFICATION_STATES.FAILED);
    expect(outcome.result.code).toBe('ACCESS_TOKEN_UNAVAILABLE');
    expect(calls).toHaveLength(0);
  });

  it('does not log the wallet token or access token', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((level) =>
      jest.spyOn(console, level).mockImplementation(() => {})
    );
    try {
      const { run } = setup({ respond: () => json(200, verified) });
      await run();
      spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
