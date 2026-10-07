/**
 * Paypage-app-2 design-system defaults (origin/master).
 * These are NOT merchant branding fields from GET /branding.
 *
 * Sources:
 * - src/styles/variables/_colors.scss
 * - src/styles/global.scss
 * - PaymentOptions.module.scss (mobile padding)
 * - WalletButtons.module.scss / Apple style.module.scss
 * - CardForm.module.scss .payButton
 * - Logo.module.scss (mobile large)
 * - Typography.module.scss
 */
const DESIGN_TOKENS = {
  colors: {
    pageBackground: '#FFFFFF',
    surface: '#FFFFFF',
    textPrimary: '#070707',
    textMuted: '#8F8F8F',
    border: '#DADADA',
    focus: '#0069B1',
    error: '#E12E56',
    errorBackground: '#FEF7F9',
    buttonBackground: '#FFD882',
    buttonHover: '#F2BB05',
    buttonText: '#5C3F00',
    walletButtonBackground: '#070707',
    walletButtonHover: '#1B1B1B',
    walletButtonText: '#FFFFFF',
    divider: '#8F8F8F',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 10,
    base: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
  },
  sizes: {
    inputHeight: 56,
    buttonHeight: 56,
    walletButtonHeight: 56,
    logoHeight: 40,
    logoMaxWidth: 96,
  },
  fontSize: {
    caption: 11,
    body: 14,
    bodyLg: 18,
    title: 16,
    button: 16,
  },
  fontWeight: {
    light: '400',
    regular: '500',
    medium: '700',
    bold: '700',
  },
};

module.exports = { DESIGN_TOKENS };
