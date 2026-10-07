const { StyleSheet } = require('react-native');

const fontStyle = (family) => (family ? { fontFamily: family } : {});

const createTokenizationStyles = (theme) => {
  const { branding, layout } = theme;
  const isRtl = Boolean(theme.isRtl);
  return StyleSheet.create({
    modalRoot: {
      flex: 1,
      backgroundColor: branding.pageBackground,
    },
    safe: {
      flex: 1,
      backgroundColor: branding.pageBackground,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: layout.spacing.lg,
      backgroundColor: branding.surfaceBackground,
    },
    header: {
      alignItems: isRtl ? 'flex-end' : 'flex-start',
      marginBottom: layout.spacing.lg,
    },
    logo: {
      height: layout.sizes.logoHeight,
      maxWidth: layout.sizes.logoMaxWidth,
      width: layout.sizes.logoMaxWidth,
      resizeMode: 'contain',
      marginBottom: layout.spacing.sm,
    },
    footerText: {
      fontSize: layout.fontSize.body,
      fontWeight: layout.fontWeight.light,
      color: branding.headingColor,
      ...fontStyle(branding.headingFontFamily || branding.subheadingFontFamily),
    },
    sectionTitle: {
      fontSize: layout.fontSize.title,
      fontWeight: layout.fontWeight.medium,
      color: branding.headingColor,
      ...fontStyle(branding.subheadingFontFamily),
      textAlign: isRtl ? 'right' : 'left',
      marginBottom: layout.spacing.sm,
      lineHeight: 32,
    },
    methods: {
      flexDirection: 'column',
    },
    consentInformation: {
      color: branding.textPrimary,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: layout.fontWeight.light,
      ...fontStyle(branding.fontFamily),
      textAlign: isRtl ? 'right' : 'left',
      writingDirection: isRtl ? 'rtl' : 'ltr',
      paddingTop: isRtl ? 12 : 10,
      paddingBottom: isRtl ? 0 : 10,
    },
    consentLink: {
      color: branding.textPrimary,
      textDecorationLine: 'underline',
    },
    walletStack: {
      flexDirection: 'column',
    },
    methodButton: {
      minHeight: layout.sizes.buttonHeight,
      height: layout.sizes.buttonHeight,
      borderRadius: layout.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: isRtl ? 'row-reverse' : 'row',
      paddingHorizontal: layout.spacing.base,
      marginBottom: layout.spacing.md,
    },
    cardButton: {
      backgroundColor: branding.buttonBackground,
    },
    cardButtonPressed: {
      backgroundColor: branding.buttonHover,
    },
    walletButton: {
      backgroundColor: layout.colors.walletButtonBackground,
    },
    walletButtonPressed: {
      backgroundColor: layout.colors.walletButtonHover,
    },
    cardButtonLabel: {
      color: branding.buttonText,
      fontSize: layout.fontSize.button,
      fontWeight: '600',
      marginHorizontal: 10,
      ...fontStyle(branding.fontFamily),
    },
    walletPayWith: {
      color: layout.colors.walletButtonText,
      fontSize: layout.fontSize.bodyLg,
      fontWeight: layout.fontWeight.regular,
      marginRight: isRtl ? 0 : 10,
      marginLeft: isRtl ? 10 : 0,
      ...fontStyle(branding.fontFamily),
    },
    walletMark: {
      color: layout.colors.walletButtonText,
      fontSize: layout.fontSize.bodyLg,
      fontWeight: layout.fontWeight.medium,
      ...fontStyle(branding.fontFamily),
    },
    divider: {
      color: layout.colors.divider,
      fontSize: layout.fontSize.body,
      ...fontStyle(branding.fontFamily),
      textAlign: 'center',
      marginVertical: layout.spacing.lg,
    },
    cancelButton: {
      marginTop: layout.spacing.lg,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      paddingHorizontal: layout.spacing.base,
      paddingVertical: layout.spacing.sm,
    },
    cancelLabel: {
      color: branding.textPrimary,
      fontSize: 14,
      fontWeight: layout.fontWeight.medium,
      ...fontStyle(branding.fontFamily),
    },
    flexSpacer: {
      flexGrow: 1,
      minHeight: layout.spacing.lg,
    },
    statusContainer: {
      paddingTop: layout.spacing.xl,
      alignItems: 'center',
      minHeight: 200,
    },
    statusTitle: {
      fontSize: layout.fontSize.bodyLg,
      fontWeight: layout.fontWeight.bold,
      color: branding.headingColor,
      ...fontStyle(branding.headingFontFamily),
      textAlign: 'center',
      marginBottom: layout.spacing.sm,
    },
    statusMessage: {
      fontSize: layout.fontSize.body,
      color: branding.textPrimary,
      ...fontStyle(branding.fontFamily),
      textAlign: 'center',
      marginBottom: layout.spacing.lg,
      lineHeight: 24,
    },
    errorBox: {
      backgroundColor: layout.colors.errorBackground,
      borderRadius: layout.radius.md,
      paddingVertical: layout.spacing.base,
      paddingHorizontal: layout.spacing.lg,
      marginBottom: layout.spacing.base,
    },
    errorText: {
      color: layout.colors.error,
      fontSize: layout.fontSize.caption,
      fontWeight: layout.fontWeight.light,
      ...fontStyle(branding.fontFamily),
      textAlign: isRtl ? 'right' : 'left',
    },
    loadingLabel: {
      marginTop: layout.spacing.base,
      color: branding.textPrimary,
      fontSize: layout.fontSize.body,
      fontWeight: layout.fontWeight.regular,
      ...fontStyle(branding.fontFamily),
      textAlign: 'center',
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginHorizontal: 3,
      backgroundColor: layout.colors.focus,
    },
    cardIcon: {
      width: 22,
      height: 16,
      borderRadius: 2,
      borderWidth: 1.5,
      borderColor: branding.buttonText,
      justifyContent: 'flex-start',
      overflow: 'hidden',
    },
    cardIconBar: {
      height: 4,
      marginTop: 3,
      backgroundColor: branding.buttonText,
      opacity: 0.85,
    },
  });
};

module.exports = { createTokenizationStyles };
