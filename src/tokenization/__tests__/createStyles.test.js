jest.mock('react-native', () => ({
  StyleSheet: {
    create: (styles) => styles,
  },
}));

const { createTokenizationStyles } = require('../createStyles');
const { resolveTokenizationTheme } = require('../resolveTheme');
const { DESIGN_TOKENS } = require('../designTokens');

describe('createTokenizationStyles', () => {
  it('reads colors and fonts from the resolved theme instead of static hex values', () => {
    const theme = resolveTokenizationTheme(
      {
        buttonColour: '#FF5859',
        paymentFontColour: '#002E5D',
        mainHeadingColour: '#003366',
        pageBackgroundColour: '#EEF2F6',
        languages: [
          {
            language: 'en',
            mainHeading: { font: 'Georgia' },
            subHeading: { font: 'Georgia' },
            bodyCopyFont: 'Georgia',
          },
        ],
      },
      { language: 'en' }
    );
    const styles = createTokenizationStyles(theme);

    expect(styles.cardButton.backgroundColor).toBe('#FF5859');
    expect(styles.sectionTitle.color).toBe('#003366');
    expect(styles.sectionTitle.fontFamily).toBe('Georgia');
    expect(styles.modalRoot.backgroundColor).toBe('#EEF2F6');
    expect(styles.cardButtonLabel.fontFamily).toBe('Georgia');
    expect(styles.cardButton.backgroundColor).not.toBe(DESIGN_TOKENS.colors.buttonBackground);
  });

  it('uses design-system geometry even when merchant branding is applied', () => {
    const theme = resolveTokenizationTheme({ buttonColour: '#000000' }, { language: 'en' });
    const styles = createTokenizationStyles(theme);
    expect(styles.methodButton.height).toBe(56);
    expect(styles.methodButton.borderRadius).toBe(8);
  });
});
