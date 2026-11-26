const {
  getTokenizationMethods,
  TOKENIZATION_SUPPORTED_METHODS,
  EXCLUDED_TOKENIZATION_METHODS,
  isTokenizationMethodSupported,
} = require('../supportedMethods');

const walletReady = { walletTokenizationAvailable: true, applePaySupported: true, googlePaySupported: true };

describe('getTokenizationMethods', () => {
  it('keeps only the card form when Get Session omits paymentMethods', () => {
    expect(getTokenizationMethods(undefined, { platform: 'ios', ...walletReady })).toEqual(['CARD']);
    expect(getTokenizationMethods(undefined, { platform: 'android', ...walletReady })).toEqual(['CARD']);
  });

  it('includes CARD when the session lists card schemes', () => {
    expect(getTokenizationMethods({ card: ['VISA', 'MASTERCARD'] }, { platform: 'android' })).toEqual(['CARD']);
  });

  it.each([
    ['an empty card list', { card: [], wallet: ['APPLE_PAY'] }],
    ['a missing card list', { wallet: ['APPLE_PAY'] }],
    ['a malformed card list', { card: 'VISA', wallet: ['APPLE_PAY'] }],
  ])('hides CARD for %s once paymentMethods is supplied', (_case, sessionMethods) => {
    expect(getTokenizationMethods(sessionMethods, { platform: 'ios', ...walletReady })).toEqual(['APPLE_PAY']);
  });

  it.each(['ios', 'android'])('keeps the card form without enabling wallets for an empty configuration on %s', platform => {
    expect(getTokenizationMethods({}, { platform, ...walletReady })).toEqual(['CARD']);
  });

  it('includes Apple Pay only on iOS and Google Pay only on Android', () => {
    const sessionMethods = { card: ['VISA'], wallet: ['APPLE_PAY', 'GOOGLE_PAY', 'SAMSUNG_PAY'] };
    expect(getTokenizationMethods(sessionMethods, { platform: 'ios', ...walletReady }))
      .toEqual(['CARD', 'APPLE_PAY']);
    expect(getTokenizationMethods(sessionMethods, { platform: 'android', ...walletReady }))
      .toEqual(['CARD', 'GOOGLE_PAY']);
    expect(getTokenizationMethods(sessionMethods, { platform: 'web', ...walletReady })).toEqual(['CARD']);
  });

  it.each([
    ['device support', { applePaySupported: false }],
    ['backend tokenization capability', { walletTokenizationAvailable: false }],
  ])('requires %s for a session-allowed wallet', (_case, override) => {
    const sessionMethods = { card: ['VISA'], wallet: ['APPLE_PAY'] };
    expect(getTokenizationMethods(sessionMethods, { platform: 'ios', ...walletReady, ...override })).toEqual(['CARD']);
  });

  it.each([
    ['an empty wallet list', { card: ['VISA'], wallet: [] }],
    ['a missing wallet list', { card: ['VISA'] }],
    ['no session paymentMethods', undefined],
  ])('does not offer wallets for %s', (_case, sessionMethods) => {
    expect(getTokenizationMethods(sessionMethods, { platform: 'ios', ...walletReady })).toEqual(['CARD']);
  });

  it('excludes Samsung Pay and APMs even when listed by the session', () => {
    const methods = getTokenizationMethods(
      { card: ['VISA'], wallet: ['SAMSUNG_PAY', 'APPLE_PAY', 'GOOGLE_PAY'], apm: ['TABBY', 'AANI'] },
      { platform: 'ios', ...walletReady },
    );
    expect(methods).toEqual(['CARD', 'APPLE_PAY']);
    EXCLUDED_TOKENIZATION_METHODS.forEach((method) => {
      expect(methods).not.toContain(method);
    });
  });

  it('does not expose unsupported methods', () => {
    expect(TOKENIZATION_SUPPORTED_METHODS).toEqual(['CARD', 'APPLE_PAY', 'GOOGLE_PAY']);
    expect(isTokenizationMethodSupported('SAMSUNG_PAY')).toBe(false);
    expect(isTokenizationMethodSupported('CARD')).toBe(true);
  });
});

describe('merchant paymentMethods prop', () => {
  const sessionMethods = { card: ['VISA'], wallet: ['APPLE_PAY'] };
  it.each([[], ['APPLE_PAY'], ['CARD'], ['SAMSUNG_PAY'], null, 'CARD'])('only narrows the session methods for %p', (requested) => {
    const result = getTokenizationMethods(sessionMethods, { paymentMethods: requested, platform: 'ios', ...walletReady });
    expect(result).toEqual(Array.isArray(requested)
      ? ['CARD', 'APPLE_PAY'].filter(method => requested.includes(method))
      : []);
  });

  it('does not narrow the session methods when it lists only CONTINUE_SHOPPING', () => {
    expect(getTokenizationMethods(sessionMethods, { paymentMethods: ['CONTINUE_SHOPPING'], platform: 'ios', ...walletReady }))
      .toEqual(['CARD', 'APPLE_PAY']);
    expect(getTokenizationMethods({ card: [], wallet: [] }, { paymentMethods: ['CONTINUE_SHOPPING'], platform: 'ios', ...walletReady }))
      .toEqual([]);
    expect(getTokenizationMethods({}, { paymentMethods: ['CONTINUE_SHOPPING'], platform: 'ios', ...walletReady }))
      .toEqual(['CARD']);
    expect(getTokenizationMethods(sessionMethods, { paymentMethods: ['CARD', 'CONTINUE_SHOPPING'], platform: 'ios', ...walletReady }))
      .toEqual(['CARD']);
  });

  it('cannot add a method that the session does not allow', () => {
    const requested = ['CARD', 'APPLE_PAY', 'GOOGLE_PAY'];
    expect(getTokenizationMethods({ card: [], wallet: [] }, { paymentMethods: requested, platform: 'ios', ...walletReady }))
      .toEqual([]);
    expect(getTokenizationMethods(undefined, { paymentMethods: requested, platform: 'ios', ...walletReady }))
      .toEqual(['CARD']);
    expect(getTokenizationMethods({}, { paymentMethods: [], platform: 'ios', ...walletReady }))
      .toEqual([]);
  });
});
