const { DESIGN_TOKENS } = require('./designTokens');
const {
  normalizeThemeString,
  firstFontFamily,
  normalizeColour,
  contrastButtonText,
} = require('./normalize');

const ARABIC_FONT_FALLBACK = 'Arial';

const pickLanguageConfig = (languages, language) => {
  if (!Array.isArray(languages) || languages.length === 0) {
    return undefined;
  }
  const lang = (language || '').toLowerCase();
  const matched = languages.find(
    (entry) => (entry && entry.language ? String(entry.language).toLowerCase() : '') === lang
  );
  return matched || languages[0];
};

const resolveLogoUrl = (branding = {}) =>
  normalizeThemeString(branding.logoUrl) ||
  normalizeThemeString(branding.merchantLogoUrl) ||
  normalizeThemeString(branding.tenantLogoUrl) ||
  normalizeThemeString(branding.footerImageUrl) ||
  normalizeThemeString(branding.faviconUrl);

/**
 * Maps a BrandingResponse (GET /api/outlets/{outletRef}/branding) plus
 * local design-system tokens into a semantic RN theme.
 *
 * Does not invent backend fields. Extra ThemeConfig keys such as primaryColor
 * are ignored if present.
 *
 * Language fonts: match `options.language` against languages[].language,
 * then languages[0], then design-system (no fontFamily). This follows
 * paypage-app-2 ClickToPaySdk, not ThemeContext, which always uses
 * languages[0] (and forces Arial for Arabic).
 */
const resolveTokenizationTheme = (branding, options = {}) => {
  const language = options.language || 'en';
  const source = branding && typeof branding === 'object' ? branding : {};
  const languageConfig = pickLanguageConfig(source.languages, language);
  const isArabic = language.toLowerCase().startsWith('ar');

  const buttonBackground =
    normalizeColour(source.buttonColour) || DESIGN_TOKENS.colors.buttonBackground;
  const buttonHover =
    normalizeColour(source.buttonRolloverColour) || DESIGN_TOKENS.colors.buttonHover;
  const buttonText = contrastButtonText(
    buttonBackground,
    DESIGN_TOKENS.colors.buttonBackground,
    DESIGN_TOKENS.colors.buttonText
  );

  const bodyFont = isArabic
    ? ARABIC_FONT_FALLBACK
    : firstFontFamily(languageConfig && languageConfig.bodyCopyFont);
  const headingFont = isArabic
    ? ARABIC_FONT_FALLBACK
    : firstFontFamily(languageConfig && languageConfig.mainHeading && languageConfig.mainHeading.font);
  const subheadingFont = isArabic
    ? ARABIC_FONT_FALLBACK
    : firstFontFamily(languageConfig && languageConfig.subHeading && languageConfig.subHeading.font);

  const textPrimary =
    normalizeColour(source.paymentFontColour) || DESIGN_TOKENS.colors.textPrimary;
  const headingColor = normalizeColour(source.mainHeadingColour) || textPrimary;

  return {
    branding: {
      buttonBackground,
      buttonHover,
      buttonText,
      textPrimary,
      headingColor,
      pageBackground:
        normalizeColour(source.pageBackgroundColour) || DESIGN_TOKENS.colors.pageBackground,
      surfaceBackground:
        normalizeColour(source.backgroundColour) || DESIGN_TOKENS.colors.surface,
      fontFamily: bodyFont,
      headingFontFamily: headingFont || bodyFont,
      subheadingFontFamily: subheadingFont || bodyFont,
      logoUrl: resolveLogoUrl(source),
      footerText: normalizeThemeString(source.footerText),
      capitalizeHeading: Boolean(
        languageConfig && languageConfig.mainHeading && languageConfig.mainHeading.capitalise
      ),
    },
    layout: DESIGN_TOKENS,
  };
};

module.exports = {
  resolveTokenizationTheme,
  pickLanguageConfig,
  resolveLogoUrl,
};
