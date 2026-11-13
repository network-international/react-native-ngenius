const { mapNativeCardColors } = require('../mapNativeCardColors');
const { resolveTokenizationTheme } = require('../resolveTheme');

describe('mapNativeCardColors', () => {
  it('maps branding fields onto iOS NISdkColors keys', () => {
    const theme = resolveTokenizationTheme(
      {
        buttonColour: '#112233',
        paymentFontColour: '#445566',
        mainHeadingColour: '#778899',
        pageBackgroundColour: '#FAFAFA',
      },
      { language: 'en' }
    );
    const colors = mapNativeCardColors(theme);

    expect(colors.payButtonBackgroundColor).toBe('#112233');
    expect(colors.payPageLabelColor).toBe('#445566');
    expect(colors.payPageTitleColor).toBe('#778899');
    expect(colors.payPageBackgroundColor).toBe('#FAFAFA');
    expect(colors.textFieldLabelColor).toBe('#445566');
    expect(colors.payButtonTitleColor).toBe('#FFFFFF');
  });
});
