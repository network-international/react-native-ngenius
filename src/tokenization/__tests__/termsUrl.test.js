const { supportedTermsUrl } = require('../termsUrl');
const { resolveConsentInformation } = require('../consentInformation');

describe('backend-resolved T&C contract', () => {
  it.each([
    'https://example.com/terms?lang=ar&ref=a%2Fb#section',
    'http://example.com/terms', 'HTTPS://example.com/terms',
  ])('preserves the supported backend URL verbatim: %s', (url) => {
    expect(supportedTermsUrl(url)).toBe(url);
    expect(resolveConsentInformation({ tncUrl: url }))
      .toMatchObject({ url, diagnostic: undefined });
  });

  it.each([
    123, {}, '/terms', 'www.example.com', 'javascript:alert(1)', 'file:///terms',
    'https://user:secret@example.com', 'https://a..b/terms', 'https://-a.example/terms',
    'https://example.com:99999/terms', 'https://example.com/\nterms', 'https://example.com\\terms',
    ' https://example.com/terms ',
  ])('rejects malformed/non-web URLs without rewriting them: %p', (tncUrl) => {
    expect(supportedTermsUrl(tncUrl)).toBeNull();
    expect(resolveConsentInformation({ tncUrl }))
      .toMatchObject({ url: null, diagnostic: 'TERMS_URL_INVALID' });
  });

  it.each([undefined, null, '', '  '])('reports missing backend field: %p', (tncUrl) => {
    expect(resolveConsentInformation({ tncUrl }))
      .toMatchObject({ url: null, diagnostic: 'TERMS_URL_MISSING' });
  });

  it('hides consent and ignores tncUrl when consent is disabled', () => {
    expect(resolveConsentInformation({ tncUrl: 'https://example.com/terms', skipConsent: true })).toBeNull();
  });

  it('does not fall back to transaction terms, branding or another prop', () => {
    expect(resolveConsentInformation({
      order: { tncUrl: 'https://injected.example', termsAndConditions: 'https://unresolved.example/terms' },
      orderData: { tncUrl: 'https://override.example/terms' },
    })).toMatchObject({ url: null, diagnostic: 'TERMS_URL_MISSING' });
  });

  it('has no PayPage/config transport or URL session modules', () => {
    const fs = require('fs');
    const path = require('path');
    for (const removed of ['paypageTerms.js', 'usePaypageTerms.js']) {
      expect(fs.existsSync(path.join(__dirname, '..', removed))).toBe(false);
    }
    for (const file of ['termsUrl.js', 'consentInformation.js', 'ui/ConsentInformation.js', 'NgeniusTokenization.js']) {
      const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      expect(source).not.toMatch(/\bfetch\s*\(|\baxios\b|XMLHttpRequest|Access-Token|Payment-Token|PAYPAGE_SESSION_UNAVAILABLE/);
    }
  });
});


describe('saved-tokens T&C source', () => {
  it('has no demo bootstrap context in the SDK', () => {
    const fs = require('fs');
    const path = require('path');
    expect(fs.existsSync(path.join(__dirname, '..', 'TokenizationBootstrapContext.js'))).toBe(false);
    const index = fs.readFileSync(path.join(__dirname, '../../../index.js'), 'utf8');
    expect(index).not.toMatch(/TokenizationBootstrapContext|DemoTokenizationBootstrap|resolvedTncUrl/);
  });
});
