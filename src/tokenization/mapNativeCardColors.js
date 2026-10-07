const { DESIGN_TOKENS } = require('./designTokens');

/**
 * Maps resolved semantic theme → public Swift NISdkColors field names
 * on NISdk 6.1.0. Android 5.2.3 has no runtime color API; callers no-op.
 */
const mapNativeCardColors = (theme) => {
  const branding = (theme && theme.branding) || {};
  return {
    payButtonBackgroundColor: branding.buttonBackground || DESIGN_TOKENS.colors.buttonBackground,
    payButtonTitleColor: branding.buttonText || DESIGN_TOKENS.colors.buttonText,
    payPageBackgroundColor: branding.pageBackground || DESIGN_TOKENS.colors.pageBackground,
    payPageLabelColor: branding.textPrimary || DESIGN_TOKENS.colors.textPrimary,
    payPageTitleColor: branding.headingColor || DESIGN_TOKENS.colors.textPrimary,
    textFieldLabelColor: branding.textPrimary || DESIGN_TOKENS.colors.textPrimary,
  };
};

module.exports = { mapNativeCardColors };
