const { DESIGN_TOKENS } = require('./designTokens');

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
