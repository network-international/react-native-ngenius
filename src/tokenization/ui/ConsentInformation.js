const React = require('react');
const { Text, Linking } = require('react-native');
const { t } = require('../strings');

const ConsentInformation = ({ information, language, styles }) => {
  if (!information) return null;
  const { url } = information;

  const link = (label, key) => url ? React.createElement(Text, {
    key,
    style: styles.consentLink,
    accessibilityRole: 'link',
    onPress: async () => {
      try {
        if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      } catch {
        // An unavailable external browser must not fail the native payment flow.
      }
    },
  }, label) : label;

  let content;
  if (information.key) {
    const parts = t(language, information.key).split('{termsOfUse}');
    content = [];
    parts.forEach((part, index) => {
      if (index) content.push(link(t(language, 'TERMS_OF_USE'), index));
      content.push(part);
    });
    // Reusable-card copy has no placeholder, so append the required terms link.
    if (parts.length === 1) content.push(' ', link(t(language, 'TERMS_OF_USE'), 'terms'));
  } else {
    content = [
      `${t(language, 'PAYMENT_DISCLAIMER_1')} `,
      link(t(language, 'PAYMENT_DISCLAIMER_2'), 'terms'),
      ` ${t(language, 'PAYMENT_DISCLAIMER_3')}.`,
    ];
  }

  return React.createElement(Text, {
    style: styles.consentInformation,
    testID: 'tokenization-consent-information',
  }, ...content);
};

module.exports = ConsentInformation;
