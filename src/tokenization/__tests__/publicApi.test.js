const fs = require('fs');
const path = require('path');

describe('public SDK exports', () => {
  const indexSource = fs.readFileSync(
    path.join(__dirname, '../../../index.js'),
    'utf8'
  );

  const requiredExports = [
    'initiateCardPayment',
    'initiateSamsungPay',
    'initiateApplePay',
    'initiateGooglePay',
    'isSamsungPaySupported',
    'isApplePaySupported',
    'isGooglePaySupported',
    'configureSDK',
    'executeThreeDSTwo',
    'getDeviceInfo',
    'SDK_VERSION',
    'NgeniusTokenization',
    'createTokenizationClient',
    'TokenizationApiError',
    'TOKENIZATION_ENVIRONMENTS',
  ];

  it('keeps the existing named payment exports and adds NgeniusTokenization', () => {
    requiredExports.forEach((name) => {
      expect(indexSource).toContain(name);
    });
    expect(indexSource).toMatch(/export \{[\s\S]*initiateCardPayment[\s\S]*NgeniusTokenization[\s\S]*\}/);
    expect(indexSource).not.toMatch(/export default/);
  });

  it('does not add a global configureSDK mode', () => {
    expect(indexSource).not.toMatch(/config\.mode/);
    expect(indexSource).not.toMatch(/TOKENIZATION['"]\s*,\s*['"]PAYMENT/);
    expect(indexSource).not.toMatch(/configureSDK[\s\S]*apiKey/);
    expect(indexSource).not.toMatch(/configureSDK[\s\S]*accessToken/);
    expect(indexSource).not.toMatch(/TOKENIZATION_MEDIA_TYPE/);
    expect(indexSource).not.toMatch(/mapCreateCardRequest/);
    expect(indexSource).not.toMatch(/TOKENIZATION_PATHS/);
  });
});
