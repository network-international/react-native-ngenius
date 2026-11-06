const { resolveModeConfig } = require('../modeConfig');
const { t } = require('../strings');

it.each(['en', 'fr', 'ar'])('uses a visible localized return button by default in %s', language => {
  expect(resolveModeConfig(undefined, language)).toEqual({
    returnButtonName: t(language, 'CONTINUE_SHOPPING'), returnButtonStyle: 'button', showSecurityNote: true, orderSummaryInitiallyExpanded: false, labels: {},
  });
});
it.each(['text', 'link', 'button'])('supports merchant return label and %s presentation', style => {
  expect(resolveModeConfig({ returnButtonName: ' BACK ', returnButtonStyle: style }).returnButtonName).toBe('BACK');
  expect(resolveModeConfig({ returnButtonStyle: style }).returnButtonStyle).toBe(style);
});
it('falls back for missing/invalid values and ignores unsupported consent or artwork overrides', () => {
  expect(resolveModeConfig({ returnButtonName: ' ', returnButtonStyle: 'hidden', labels: { pageTitle: 'Choose a method', consent: 'Injected', addCard: null }, consentText: 'Injected' })).toEqual({
    returnButtonName: t('en', 'CONTINUE_SHOPPING'), returnButtonStyle: 'button', showSecurityNote: true, orderSummaryInitiallyExpanded: false, labels: { pageTitle: 'Choose a method' },
  });
  expect(resolveModeConfig({ returnButtonName: 'line\nbreak' }).returnButtonName).toBe(t('en', 'CONTINUE_SHOPPING'));
});

it('accepts optional order/title presentation and valid policy links without legal-copy overrides', () => {
  expect(resolveModeConfig({ orderSummaryInitiallyExpanded: true, showSecurityNote: false,
    privacyPolicyUrl: 'https://merchant.test/privacy', labels: { pageTitle: 'Complete your booking', pageSubtitle: 'Choose a method', orderSummary: 'Your visit' } }))
    .toMatchObject({ orderSummaryInitiallyExpanded: true, showSecurityNote: false,
      privacyPolicyUrl: 'https://merchant.test/privacy', labels: { pageTitle: 'Complete your booking', pageSubtitle: 'Choose a method', orderSummary: 'Your visit' } });
  expect(resolveModeConfig({ privacyPolicyUrl: 'javascript:alert(1)' }).privacyPolicyUrl).toBeUndefined();
});
