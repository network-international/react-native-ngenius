const {
  createTokenizationSession,
  pocNativeResult,
  pocErrorResult,
  savedTokenResult,
  awaitingThreeDSResult,
  apiErrorResult,
  THREE_DS_CONTINUATION_UNAVAILABLE,
} = require('../session');

describe('createTokenizationSession', () => {
  it('resets flags when a new visible session starts', () => {
    const session = createTokenizationSession();
    const onSuccess = jest.fn();
    session.tryBeginNative();
    session.emitSuccess(onSuccess, { status: 'Success' });
    expect(onSuccess).toHaveBeenCalledTimes(1);

    session.start();
    expect(session.tryBeginNative()).toBe(true);
    session.emitSuccess(onSuccess, { status: 'Success' });
    expect(onSuccess).toHaveBeenCalledTimes(2);
  });

  it('does not emit onSuccess twice for the same session', () => {
    const session = createTokenizationSession();
    session.start();
    const onSuccess = jest.fn();
    session.tryBeginNative();
    expect(session.emitSuccess(onSuccess, { status: 'Success' })).toBe(true);
    expect(session.emitSuccess(onSuccess, { status: 'Success' })).toBe(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not emit onError twice for the same failed attempt', () => {
    const session = createTokenizationSession();
    session.start();
    const onError = jest.fn();
    session.tryBeginNative();
    expect(session.emitError(onError, { status: 'Failed' })).toBe(true);
    expect(session.emitError(onError, { status: 'Failed' })).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('ignores a second native start while in flight (double tap)', () => {
    const session = createTokenizationSession();
    session.start();
    expect(session.tryBeginNative()).toBe(true);
    expect(session.tryBeginNative()).toBe(false);
    expect(session.isInFlight()).toBe(true);
  });

  it('does not emit onCancel while native UI is in flight', () => {
    const session = createTokenizationSession();
    session.start();
    const onCancel = jest.fn();
    session.tryBeginNative();
    expect(session.emitCancel(onCancel)).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    session.endNative();
    expect(session.emitCancel(onCancel)).toBe(true);
    expect(session.emitCancel(onCancel)).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('POC result model', () => {
  it('does not invent tokenRef / usageType / authType', () => {
    const result = pocNativeResult({ method: 'CARD', status: 'Success' });
    expect(result.niTokenCreated).toBe(false);
    expect(result.savedToken).toBe(null);
    expect(result.poc).toBeUndefined();
    expect(result).not.toHaveProperty('tokenRef');
    expect(result).not.toHaveProperty('usageType');
    expect(result).not.toHaveProperty('authType');
  });

  it('does not copy unknown native payload fields onto errors', () => {
    const result = pocErrorResult({
      status: 'Failed',
      error: 'Aborted by user',
      token: 'wallet-payload',
      pan: '4111111111111111',
    });
    expect(result.error).toBe('Aborted by user');
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('pan');
  });
});

describe('backend result model', () => {
  const verified = {
    tokenRef: 'tok_9',
    type: 'WALLET',
    walletType: 'GOOGLE_PAY',
    status: 'VERIFIED',
    cardDetails: { scheme: 'VISA', last4: '4242', expiry: '2029-06' },
    orderReference: 'ord-9',
    paymentReference: 'pay-9',
  };

  it('exposes only safe saved-token fields for VERIFIED', () => {
    const result = savedTokenResult({ method: 'GOOGLE_PAY', savedToken: verified });
    expect(result).toEqual({
      flow: 'TOKENIZATION',
      method: 'GOOGLE_PAY',
      status: 'VERIFIED',
      niTokenCreated: true,
      savedToken: {
        tokenRef: 'tok_9',
        type: 'WALLET',
        walletType: 'GOOGLE_PAY',
        status: 'VERIFIED',
        cardDetails: verified.cardDetails,
      },
      capture: 'REAL_TOKENIZATION_API',
    });
  });

  it('does not report AWAIT_3DS as a created token', () => {
    const result = awaitingThreeDSResult({ method: 'GOOGLE_PAY' });
    expect(result.status).toBe('AWAIT_3DS');
    expect(result.code).toBe(THREE_DS_CONTINUATION_UNAVAILABLE);
    expect(result.niTokenCreated).toBe(false);
    expect(result.savedToken).toBeNull();
  });

  it('keeps only code and message from API errors', () => {
    const result = apiErrorResult({
      method: 'GOOGLE_PAY',
      error: { code: 'walletVerificationFailed', message: 'Unprocessable Entity', encryptedPayload: 'x' },
    });
    expect(result).toMatchObject({
      status: 'FAILED',
      code: 'walletVerificationFailed',
      error: 'Unprocessable Entity',
      niTokenCreated: false,
    });
    expect(JSON.stringify(result)).not.toContain('encryptedPayload');
  });
});
