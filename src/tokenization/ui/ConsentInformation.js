const React = require('react');
const { Text, Linking } = require('react-native');
const { t } = require('../strings');

// No text/content prop: copy belongs to the SDK localization table.
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
    // PayPage's UNSCHEDULED copy contains no link token. Product now requires a
    // terms reference for this variant too; retain its exact copy and append the
    // existing localized terms label, linked only to the resolved destination.
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
