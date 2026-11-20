const {
  getTokenizationMethods,
  TOKENIZATION_SUPPORTED_METHODS,
  EXCLUDED_TOKENIZATION_METHODS,
  isTokenizationMethodSupported,
} = require('../supportedMethods');

describe('getTokenizationMethods', () => {
  it('includes CARD by default', () => {
    expect(getTokenizationMethods({}, { platform: 'ios' })).toEqual(['CARD']);
  });

  it('includes CARD when the order lists card schemes', () => {
    const order = { paymentMethods: { card: ['VISA', 'MASTERCARD'] } };
    expect(getTokenizationMethods(order, { platform: 'android' })).toEqual(['CARD']);
  });

  it('includes Apple Pay only on iOS when supported', () => {
    const order = { paymentMethods: { card: ['VISA'], wallet: ['APPLE_PAY', 'SAMSUNG_PAY'] } };
    expect(
      getTokenizationMethods(order, { platform: 'ios', applePaySupported: true })
    ).toEqual(['CARD', 'APPLE_PAY']);
    expect(
      getTokenizationMethods(order, { platform: 'android', applePaySupported: true })
    ).toEqual(['CARD']);
  });

  it('includes Google Pay only on Android when supported', () => {
    const order = { paymentMethods: { card: ['VISA'], wallet: ['GOOGLE_PAY', 'SAMSUNG_PAY'] } };
    expect(
      getTokenizationMethods(order, { platform: 'android', googlePaySupported: true })
    ).toEqual(['CARD', 'GOOGLE_PAY']);
    expect(
      getTokenizationMethods(order, { platform: 'ios', googlePaySupported: true })
    ).toEqual(['CARD']);
  });

  it('excludes Samsung Pay and APMs even when present on the order', () => {
    const order = {
      paymentMethods: {
        card: ['VISA'],
        wallet: ['SAMSUNG_PAY', 'APPLE_PAY', 'GOOGLE_PAY'],
        apm: ['TABBY', 'AANI', 'CHINA_UNION_PAY'],
      },
    };
    const methods = getTokenizationMethods(order, {
      platform: 'ios',
      applePaySupported: true,
      googlePaySupported: true,
    });
    expect(methods).toEqual(['CARD', 'APPLE_PAY']);
    EXCLUDED_TOKENIZATION_METHODS.forEach((method) => {
      expect(methods).not.toContain(method);
    });
  });

  it('hides CARD when the order lists an empty card array', () => {
    const order = { paymentMethods: { card: [] } };
    expect(getTokenizationMethods(order, { platform: 'ios' })).toEqual([]);
  });

  it('does not render Apple Pay when the wallet list is present but empty', () => {
    const order = { paymentMethods: { card: ['VISA'], wallet: [] } };
    expect(
      getTokenizationMethods(order, { platform: 'ios', applePaySupported: true })
    ).toEqual(['CARD']);
  });

  it('does not expose unsupported methods', () => {
    expect(TOKENIZATION_SUPPORTED_METHODS).toEqual(['CARD', 'APPLE_PAY', 'GOOGLE_PAY']);
    expect(isTokenizationMethodSupported('SAMSUNG_PAY')).toBe(false);
    expect(isTokenizationMethodSupported('CARD')).toBe(true);
  });
});


describe('explicit merchant tokenization allowlist', () => {
  const paymentMethods = ['CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'SAMSUNG_PAY', 'TABBY', 'SPLIT_SETTLEMENT'];
  it.each([
    ['ios', true, true, ['CARD', 'APPLE_PAY']],
    ['android', true, true, ['CARD', 'GOOGLE_PAY']],
    ['ios', false, true, ['CARD']],
    ['android', true, false, ['CARD']],
    ['web', true, true, ['CARD']],
  ])('filters %s by native capability', (platform, applePaySupported, googlePaySupported, expected) => {
    expect(getTokenizationMethods({}, { paymentMethods, platform, applePaySupported, googlePaySupported })).toEqual(expected);
  });
  it.each([[], ['APPLE_PAY'], ['GOOGLE_PAY'], ['SAMSUNG_PAY'], null, 'CARD'])('does not add unrequested methods for %p', (requested) => {
    const result = getTokenizationMethods({}, { paymentMethods: requested, platform: 'ios', applePaySupported: true });
    expect(result).toEqual(Array.isArray(requested) && requested.includes('APPLE_PAY') ? ['APPLE_PAY'] : []);
  });
});
