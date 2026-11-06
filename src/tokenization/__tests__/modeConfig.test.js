const { resolveModeConfig } = require('../modeConfig');
const { t } = require('../strings');

it.each(['en', 'fr', 'ar'])('uses a visible localized return button by default in %s', language => {
  expect(resolveModeConfig(undefined, language)).toEqual({
    returnButtonName: t(language, 'CONTINUE_SHOPPING'), returnButtonStyle: 'button', labels: {},
  });
});
it.each(['text', 'link', 'button'])('supports merchant return label and %s presentation', style => {
  expect(resolveModeConfig({ returnButtonName: ' BACK ', returnButtonStyle: style }).returnButtonName).toBe('BACK');
  expect(resolveModeConfig({ returnButtonStyle: style }).returnButtonStyle).toBe(style);
});
it('falls back for missing/invalid values and ignores unsupported consent or artwork overrides', () => {
  expect(resolveModeConfig({ returnButtonName: ' ', returnButtonStyle: 'hidden', labels: { pageTitle: 'Choose a method', consent: 'Injected', addCard: null }, consentText: 'Injected' })).toEqual({
    returnButtonName: t('en', 'CONTINUE_SHOPPING'), returnButtonStyle: 'button', labels: { pageTitle: 'Choose a method' },
  });
  expect(resolveModeConfig({ returnButtonName: 'line\nbreak' }).returnButtonName).toBe(t('en', 'CONTINUE_SHOPPING'));
});
