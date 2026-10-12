const fs = require('fs');
const path = require('path');

describe('public SDK exports', () => {
  const indexSource = fs.readFileSync(
    path.join(__dirname, '../../../index.js'),
    'utf8'
  );

  const exportedNames = () => {
    const block = indexSource.match(/^export \{([\s\S]*?)\};/m)[1];
    const named = block.split(',').map((name) => name.trim()).filter(Boolean);
    const constants = [...indexSource.matchAll(/^export const (\w+)/gm)].map((match) => match[1]);
    return [...named, ...constants].sort();
  };

  it('exports exactly the existing payment API plus the tokenization additions', () => {
    expect(exportedNames()).toEqual([
      'NgeniusTokenization',
      'SDK_VERSION',
      'TokenizationApiError',
      'configureSDK',
      'createTokenizationClient',
      'executeThreeDSTwo',
      'getDeviceInfo',
      'initiateApplePay',
      'initiateCardPayment',
      'initiateGooglePay',
      'initiateSamsungPay',
      'isApplePaySupported',
      'isGooglePaySupported',
      'isSamsungPaySupported',
    ]);
    expect(indexSource).not.toMatch(/export default/);
  });

  it('does not expose internal tokenization helpers', () => {
    ['resolveTokenizationTheme', 'getTokenizationMethods', 'TOKENIZATION_SUPPORTED_METHODS']
      .forEach((name) => expect(indexSource).not.toContain(name));
  });

  it('does not add a global configureSDK mode', () => {
    expect(indexSource).not.toMatch(/config\.mode/);
    expect(indexSource).not.toMatch(/TOKENIZATION['"]\s*,\s*['"]PAYMENT/);
    expect(indexSource).not.toMatch(/configureSDK[\s\S]*apiKey/);
    expect(indexSource).not.toMatch(/configureSDK[\s\S]*accessToken/);
    expect(indexSource).not.toMatch(/TOKENIZATION_MEDIA_TYPE/);
    expect(indexSource).not.toMatch(/mapCreateCardRequest/);
    expect(indexSource).not.toMatch(/TOKENIZATION_PATHS/);
    expect(indexSource).not.toMatch(/TOKENIZATION_ENVIRONMENTS/);
    expect(indexSource).not.toMatch(/api\.network\.global/);
  });
});
