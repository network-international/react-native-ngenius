const { supportedTermsUrl } = require('../termsUrl');
const { resolveConsentInformation } = require('../consentInformation');

describe('backend-resolved T&C contract', () => {
  it.each([
    'https://example.com/terms?lang=ar&ref=a%2Fb#section',
    'http://example.com/terms', 'HTTPS://example.com/terms',
  ])('preserves the supported backend URL verbatim: %s', (url) => {
    expect(supportedTermsUrl(url)).toBe(url);
    expect(resolveConsentInformation({ bootstrap: { resolvedTncUrl: url } }))
      .toMatchObject({ url, diagnostic: undefined });
  });

  it.each([
    123, {}, '/terms', 'www.example.com', 'javascript:alert(1)', 'file:///terms',
    'https://user:secret@example.com', 'https://a..b/terms', 'https://-a.example/terms',
    'https://example.com:99999/terms', 'https://example.com/\nterms', 'https://example.com\\terms',
    ' https://example.com/terms ',
  ])('rejects malformed/non-web URLs without rewriting them: %p', (tncUrl) => {
    expect(supportedTermsUrl(tncUrl)).toBeNull();
    expect(resolveConsentInformation({ bootstrap: { resolvedTncUrl: tncUrl } }))
      .toMatchObject({ url: null, diagnostic: 'TERMS_URL_INVALID' });
  });

  it.each([undefined, null, '', '  '])('reports missing backend field: %p', (tncUrl) => {
    expect(resolveConsentInformation({ bootstrap: { resolvedTncUrl: tncUrl } }))
      .toMatchObject({ url: null, diagnostic: 'TERMS_URL_MISSING' });
  });

  it('skips URL consumption and diagnostics when consent is disabled', () => {
    const bootstrap = { get resolvedTncUrl() { throw new Error('must not read'); } };
    expect(resolveConsentInformation({ bootstrap, consentOff: true })).toBeNull();
  });

  it('does not fall back to transaction terms, branding or another prop', () => {
    expect(resolveConsentInformation({
      order: { tncUrl: 'https://injected.example', termsAndConditions: 'https://unresolved.example/terms' },
      orderData: { tncUrl: 'https://override.example/terms' },
      tncUrl: 'https://override.example/terms',
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


describe('internal bootstrap boundary', () => {
  const { readResolvedTncUrl } = require('../TokenizationBootstrapContext');
  const order = {};
  it('skips URL reads entirely for disabled, closed or unrelated sessions', () => {
    const bootstrap = { nativeOrder: order, get resolvedTncUrl() { throw new Error('must not read'); } };
    expect(readResolvedTncUrl({ bootstrap, order, visible: true, consentOff: true })).toBeUndefined();
    expect(readResolvedTncUrl({ bootstrap, order, visible: false })).toBeUndefined();
    expect(readResolvedTncUrl({ bootstrap, order: {}, visible: true })).toBeUndefined();
  });
  it('has no mutable global URL cache or public export', () => {
    const bootstrap = { nativeOrder: order, resolvedTncUrl: 'https://example.com/?query=a%2Fb' };
    expect(readResolvedTncUrl({ bootstrap, order, visible: true })).toBe(bootstrap.resolvedTncUrl);
    expect(readResolvedTncUrl({ bootstrap: null, order, visible: true })).toBeUndefined();
    const index = require('fs').readFileSync(require('path').join(__dirname, '../../../index.js'), 'utf8');
    expect(index).not.toMatch(/TokenizationBootstrapContext|DemoTokenizationBootstrap|resolvedTncUrl/);
  });
});
