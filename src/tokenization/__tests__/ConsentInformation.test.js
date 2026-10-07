jest.mock('react-native', () => ({
  Text: 'Text',
  Linking: { canOpenURL: jest.fn().mockResolvedValue(true), openURL: jest.fn().mockResolvedValue(undefined) },
  StyleSheet: { create: (styles) => styles },
}));

const { Linking } = require('react-native');
const ConsentInformation = require('../ui/ConsentInformation');
const { createTokenizationStyles } = require('../createStyles');
const { resolveTokenizationTheme } = require('../resolveTheme');
const { STRINGS } = require('../strings');
// Extracted from paypage-app-2 commit 1d37b89b, not from the SDK table.
const paypageCopy = require('./fixtures/paypage-consent.json');

const order = {};
const bootstrap = { resolvedTncUrl: 'https://example.com/terms?lang=fr&ref=a%2Fb#section' };
const { resolveConsentInformation } = require('../consentInformation');
const ordinaryCopy = 'By clicking "Pay", you agree to the Terms and Conditions and authorize this transaction.';
const text = (node) => {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node == null) return '';
  return typeof node === 'object' ? text(node.props.children) : String(node);
};
const links = (node) => {
  if (Array.isArray(node)) return node.flatMap(links);
  if (!node || typeof node !== 'object') return [];
  return node.props.accessibilityRole === 'link' ? [node] : links(node.props.children);
};
const render = (props = {}, branding) => {
  const language = props.language || 'en';
  const theme = resolveTokenizationTheme(branding, { language });
  const styles = createTokenizationStyles({ ...theme, isRtl: language.startsWith('ar') });
  return ConsentInformation({ language, styles, information: resolveConsentInformation({ order, bootstrap, ...props }) });
};

describe('ConsentInformation', () => {
  it.each([undefined, false])('uses default behavior for consentOff=%p', (consentOff) => {
    expect(text(render({ consentOff }))).toBe(ordinaryCopy);
    expect(text(render({ consentOff, order: undefined }))).toBe(ordinaryCopy);
    expect(links(render({ consentOff }))).toHaveLength(1);
  });

  it('returns null with no text, container or spacing when explicitly disabled', () => {
    expect(render({ consentOff: true })).toBeNull();
  });

  it.each([null, 'true', 'false', 1, 0, [], {}, { mode: 'hidden' }])(
    'uses default behavior for malformed consentOff=%p', (consentOff) => {
      expect(text(render({ consentOff }))).toBe(ordinaryCopy);
    }
  );

  it.each([undefined, null, '', '   ', 'javascript:alert(1)', 'www.example.com']) (
    'preserves consent without a clickable link for tncUrl=%p', (tncUrl) => {
      const node = render({ bootstrap: { resolvedTncUrl: tncUrl } });
      expect(text(node)).toBe(ordinaryCopy);
      expect(links(node)).toHaveLength(0);
    }
  );

  it.each(['en', 'fr', 'ar'])('retains exact paypage keys/copy for %s', (language) => {
    for (const [key, copy] of Object.entries(paypageCopy[language])) {
      expect(STRINGS[language][key]).toBe(copy);
    }
    const copy = paypageCopy[language];
    expect(text(render({ language }))).toBe(
      `${copy.PAYMENT_DISCLAIMER_1} ${copy.PAYMENT_DISCLAIMER_2} ${copy.PAYMENT_DISCLAIMER_3}.`
    );
  });

  it.each([['fr-FR', 'fr'], ['ar-AE', 'ar'], ['de', 'en']])(
    'resolves language %s to %s', (language, fallback) => {
      expect(text(render({ language }))).toBe(text(render({ language: fallback })));
    }
  );

  it.each([
    ['UNSCHEDULED', undefined, 'UNSCHEDULED_TERMS_AND_CONDITIONS'],
    ['RECURRING', 'subscription', 'SUBSCRIPTION_TERMS_AND_CONDITIONS'],
    ['INSTALLMENT', 'subscription', 'INSTALLMENT_TERMS_AND_CONDITIONS'],
  ])('uses existing order metadata for %s', (type, paymentModel, key) => {
    const variantOrder = { ...order, type, merchantAttributes: { paymentModel } };
    for (const language of ['en', 'fr', 'ar']) {
      const node = render({ order: variantOrder, language });
      const copy = paypageCopy[language];
      const expected = copy[key].split('{termsOfUse}').join(copy.TERMS_OF_USE);
      expect(text(node)).toBe(key === 'UNSCHEDULED_TERMS_AND_CONDITIONS'
        ? `${expected} ${copy.TERMS_OF_USE}` : expected);
      expect(links(node).length).toBeGreaterThan(0);
      expect(text(node)).not.toContain('{termsOfUse}');
    }
    expect(text(render({ order: { ...variantOrder, isSaudiPaymentEnabled: true } }))).toBe(ordinaryCopy);
  });

  it.each([
    undefined, {}, { type: 'RECURRING' }, { type: 'INSTALLMENT' },
    { type: 'RECURRING', merchantAttributes: { paymentModel: 'SUBSCRIPTION' } },
  ])('falls back to the ordinary disclaimer for order=%p', (order) => {
    expect(text(render({ order }))).toBe(ordinaryCopy);
  });

  it.each(['VERIFY', 'PURCHASE', 'AUTH'])('does not invent action-specific wording for %s', (action) => {
    const order = { action, amount: { value: 12345, currencyCode: 'AED' } };
    expect(text(render({ order }))).toBe(ordinaryCopy);
  });

  it('ignores merchant text, branding messages and unconsumed amount/conversion fields', () => {
    expect(text(render({
      text: 'Injected', children: 'Injected',
      informationalText: { mode: 'custom', text: 'Injected' },
      orderData: { tncUrl: 'https://merchant.invalid/override', text: 'Injected' },
    }, { customizedMessage: 'Injected' }))).toBe(ordinaryCopy);
  });

  it('ignores orderData, top-level URL/providers, branding and transaction fallback fields', () => {
    const injected = { tncUrl: 'https://merchant.invalid/override' };
    const getTermsUrl = jest.fn(() => injected.tncUrl);
    const node = render({
      bootstrap: null, order: { tncUrl: injected.tncUrl, termsAndConditions: injected.tncUrl }, orderData: injected,
      tncUrl: injected.tncUrl, terms: { status: 'ready', url: injected.tncUrl }, getTermsUrl,
    }, injected);
    expect(text(node)).toBe(ordinaryCopy);
    expect(links(node)).toHaveLength(0);
    expect(getTermsUrl).not.toHaveBeenCalled();
  });

  it.each(['en', 'fr', 'ar'])('opens the resolved URL for the standard %s link', async (language) => {
    Linking.openURL.mockClear();
    await links(render({ language }))[0].props.onPress();
    expect(Linking.openURL).toHaveBeenCalledWith(bootstrap.resolvedTncUrl);
  });

  it('opens the real terms URL for every localized terms token', async () => {
    Linking.openURL.mockClear();
    const node = render({ order: { ...order, type: 'RECURRING', merchantAttributes: { paymentModel: 'subscription' } } });
    expect(links(node)).toHaveLength(2);
    for (const link of links(node)) await link.props.onPress();
    expect(Linking.openURL.mock.calls).toEqual([[bootstrap.resolvedTncUrl], [bootstrap.resolvedTncUrl]]);
  });

  it('does not open unsupported destinations or fail on capability lookup rejection', async () => {
    Linking.openURL.mockClear();
    Linking.canOpenURL.mockResolvedValueOnce(false);
    await links(render())[0].props.onPress();
    expect(Linking.openURL).not.toHaveBeenCalled();
    Linking.canOpenURL.mockRejectedValueOnce(new Error('unavailable'));
    await expect(links(render())[0].props.onPress()).resolves.toBeUndefined();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('does not fail payment when opening the browser fails', async () => {
    Linking.openURL.mockRejectedValueOnce(new Error('Browser unavailable'));
    await expect(links(render())[0].props.onPress()).resolves.toBeUndefined();
  });

  it('uses resolved merchant font/color and paypage consent typography', () => {
    const node = render({ language: 'fr' }, {
      paymentFontColour: '#123456',
      languages: [{ language: 'fr', bodyCopyFont: 'Georgia' }],
    });
    expect(node.props.style).toMatchObject({
      color: '#123456', fontFamily: 'Georgia', fontSize: 13, lineHeight: 16,
      paddingTop: 10, paddingBottom: 10, writingDirection: 'ltr',
    });
    expect(links(node)[0].props.style.color).toBe('#123456');
    expect(render({ language: 'ar' }).props.style).toMatchObject({
      fontFamily: 'Arial', textAlign: 'right', writingDirection: 'rtl', paddingTop: 12,
    });
    expect(render({}, { paymentFontColour: 'invalid' }).props.style.color)
      .toBe(resolveTokenizationTheme().branding.textPrimary);
  });
});
