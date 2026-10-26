const React = require('react');
const { View, Text, Pressable } = require('react-native');
const { t } = require('../strings');
const ConsentInformation = require('./ConsentInformation');

const ConsentCheckbox = ({ information, language, styles, checked = false, onChange }) => {
  if (!information) return null;
  return React.createElement(View, { style: styles.consentBlock, testID: 'tokenization-consent' },
    React.createElement(Pressable, {
      testID: 'tokenization-consent-checkbox',
      accessibilityRole: 'checkbox',
      accessibilityLabel: t(language, 'CONSENT_ACCEPT'),
      accessibilityState: { checked: Boolean(checked) },
      style: styles.consentToggle,
      onPress: () => onChange(!checked),
    },
    React.createElement(View, { style: styles.checkbox, accessible: false },
      React.createElement(Text, { style: styles.checkboxMark }, checked ? '✓' : '')),
    React.createElement(Text, { style: styles.consentLabel }, t(language, 'CONSENT_ACCEPT'))),
    // A sibling link stays independently accessible and never toggles the checkbox.
    React.createElement(ConsentInformation, { information, language, styles }));
};
module.exports = ConsentCheckbox;
