const { getTokenizationMethods } = require('../supportedMethods');

describe('tokenization flow isolation', () => {
  it('does not require a global SDK mode to select tokenization methods', () => {
    const order = {
      paymentMethods: {
        card: ['VISA'],
        wallet: ['APPLE_PAY', 'SAMSUNG_PAY'],
        apm: ['TABBY'],
      },
    };

    expect(
      getTokenizationMethods(order, { platform: 'ios', applePaySupported: true })
    ).toEqual(['CARD', 'APPLE_PAY']);
  });
});
