const { resolveTokenizationTheme } = require('../resolveTheme');
const { DESIGN_TOKENS } = require('../designTokens');

describe('resolveTokenizationTheme', () => {
  it('uses design-system defaults when branding is missing', () => {
    const theme = resolveTokenizationTheme(undefined, { language: 'en' });

    expect(theme.branding.buttonBackground).toBe(DESIGN_TOKENS.colors.buttonBackground);
    expect(theme.branding.buttonText).toBe(DESIGN_TOKENS.colors.buttonText);
    expect(theme.branding.pageBackground).toBe(DESIGN_TOKENS.colors.pageBackground);
    expect(theme.branding.fontFamily).toBeUndefined();
    expect(theme.layout.sizes.buttonHeight).toBe(56);
    expect(theme.layout.radius.lg).toBe(12);
  });

  it('applies merchant BrandingResponse colors and fonts', () => {
    const theme = resolveTokenizationTheme(
      {
        buttonColour: '#FF5859',
        buttonRolloverColour: '#D94A4B',
        paymentFontColour: '#002E5D',
        mainHeadingColour: '#003366',
        pageBackgroundColour: '#F7F8FA',
        backgroundColour: '#FFFFFF',
        footerText: 'Demo Merchant',
        logoUrl: 'https://example.com/logo.png',
        languages: [
          {
            language: 'EN',
            mainHeading: { font: 'Georgia', capitalise: true },
            subHeading: { font: 'Georgia' },
            bodyCopyFont: 'Georgia',
          },
        ],
      },
      { language: 'en' }
    );

    expect(theme.branding.buttonBackground).toBe('#FF5859');
    expect(theme.branding.buttonHover).toBe('#D94A4B');
    expect(theme.branding.textPrimary).toBe('#002E5D');
    expect(theme.branding.headingColor).toBe('#003366');
    expect(theme.branding.pageBackground).toBe('#F7F8FA');
    expect(theme.branding.fontFamily).toBe('Georgia');
    expect(theme.branding.headingFontFamily).toBe('Georgia');
    expect(theme.branding.logoUrl).toBe('https://example.com/logo.png');
    expect(theme.branding.footerText).toBe('Demo Merchant');
    expect(theme.branding.capitalizeHeading).toBe(true);
    expect(theme.branding.buttonText).toBe('#FFFFFF');
  });

  it('ignores placeholder branding strings and takes the first font family', () => {
    const theme = resolveTokenizationTheme(
      {
        buttonColour: 'none',
        logoUrl: 'undefined',
        merchantLogoUrl: 'https://example.com/merchant.png',
        languages: [
          {
            language: 'en',
            mainHeading: { font: 'Gotham Book, Arial, sans-serif' },
            subHeading: { font: 'Gotham Book' },
            bodyCopyFont: "Gotham, Arial, sans-serif",
          },
        ],
      },
      { language: 'en' }
    );

    expect(theme.branding.buttonBackground).toBe(DESIGN_TOKENS.colors.buttonBackground);
    expect(theme.branding.logoUrl).toBe('https://example.com/merchant.png');
    expect(theme.branding.fontFamily).toBe('Gotham');
  });

  it('uses Arial for Arabic regardless of branding font', () => {
    const theme = resolveTokenizationTheme(
      {
        languages: [
          {
            language: 'AR',
            mainHeading: { font: 'Gotham Book' },
            subHeading: { font: 'Gotham Book' },
            bodyCopyFont: 'Gotham Book',
          },
        ],
      },
      { language: 'ar' }
    );

    expect(theme.branding.fontFamily).toBe('Arial');
    expect(theme.branding.headingFontFamily).toBe('Arial');
  });

  it('selects the requested language entry rather than languages[0]', () => {
    const theme = resolveTokenizationTheme(
      {
        languages: [
          {
            language: 'EN',
            mainHeading: { font: 'Georgia' },
            subHeading: { font: 'Georgia' },
            bodyCopyFont: 'Georgia',
          },
          {
            language: 'FR',
            mainHeading: { font: 'Times New Roman' },
            subHeading: { font: 'Times New Roman' },
            bodyCopyFont: 'Times New Roman',
          },
        ],
      },
      { language: 'fr' }
    );
    expect(theme.branding.fontFamily).toBe('Times New Roman');
  });

  it('falls back to the first language entry when the requested language is missing', () => {
    const theme = resolveTokenizationTheme(
      {
        languages: [
          {
            language: 'EN',
            bodyCopyFont: 'Georgia',
            mainHeading: { font: 'Georgia' },
            subHeading: { font: 'Georgia' },
          },
        ],
      },
      { language: 'de' }
    );
    expect(theme.branding.fontFamily).toBe('Georgia');
  });

  it('falls back to design-system colours for null, empty, and invalid values', () => {
    const theme = resolveTokenizationTheme(
      {
        buttonColour: null,
        buttonRolloverColour: '',
        paymentFontColour: 'not-a-color',
        mainHeadingColour: undefined,
        pageBackgroundColour: '#FFF',
        backgroundColour: 'none',
        languages: null,
      },
      { language: 'en' }
    );

    expect(theme.branding.buttonBackground).toBe(DESIGN_TOKENS.colors.buttonBackground);
    expect(theme.branding.buttonHover).toBe(DESIGN_TOKENS.colors.buttonHover);
    expect(theme.branding.textPrimary).toBe(DESIGN_TOKENS.colors.textPrimary);
    expect(theme.branding.pageBackground).toBe(DESIGN_TOKENS.colors.pageBackground);
    expect(theme.branding.surfaceBackground).toBe(DESIGN_TOKENS.colors.surface);
    expect(theme.branding.fontFamily).toBeUndefined();
    expect(theme.layout.sizes.buttonHeight).toBe(56);
  });

  it('does not map invented ThemeConfig fields such as primaryColor', () => {
    const theme = resolveTokenizationTheme(
      {
        primaryColor: '#00ff00',
        buttonColour: '#112233',
      },
      { language: 'en' }
    );

    expect(theme.branding.buttonBackground).toBe('#112233');
    expect(JSON.stringify(theme)).not.toContain('#00ff00');
  });
});
