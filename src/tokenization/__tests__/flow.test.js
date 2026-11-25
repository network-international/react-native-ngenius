const { getTokenizationMethods } = require('../supportedMethods');

describe('tokenization flow isolation', () => {
  it('does not require a global SDK mode to select tokenization methods', () => {
    const sessionPaymentMethods = {
      card: ['VISA'],
      wallet: ['APPLE_PAY', 'SAMSUNG_PAY'],
    };

    expect(
      getTokenizationMethods(sessionPaymentMethods, {
        platform: 'ios', applePaySupported: true, walletTokenizationAvailable: true,
      })
    ).toEqual(['CARD', 'APPLE_PAY']);
  });
});
