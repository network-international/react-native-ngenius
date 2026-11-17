const { DESIGN_TOKENS } = require('./designTokens');

const mapNativeCardColors = (theme) => {
  const branding = (theme && theme.branding) || {};
  const colors = (theme && theme.layout && theme.layout.colors) || DESIGN_TOKENS.colors;
  return {
    payButtonBackgroundColor: branding.buttonBackground || DESIGN_TOKENS.colors.buttonBackground,
    payButtonTitleColor: branding.buttonText || DESIGN_TOKENS.colors.buttonText,
    payPageBackgroundColor: branding.surfaceBackground || DESIGN_TOKENS.colors.surface,
    payPageLabelColor: branding.textPrimary || DESIGN_TOKENS.colors.textPrimary,
    payPageTitleColor: branding.headingColor || DESIGN_TOKENS.colors.textPrimary,
    textFieldLabelColor: branding.textPrimary || DESIGN_TOKENS.colors.textPrimary,
    textFieldBorderColor: colors.border,
    textFieldFocusColor: branding.focusColor || DESIGN_TOKENS.colors.focus,
  };
};

module.exports = { mapNativeCardColors };
