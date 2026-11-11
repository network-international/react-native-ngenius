import React from 'react';
import { View, Text, Linking } from 'react-native';
const { t } = require('../strings');
const { supportedTermsUrl } = require('../termsUrl');

const open = async url => {
  try { if (await Linking.canOpenURL(url)) await Linking.openURL(url); } catch { /* Keep checkout usable if the browser cannot open. */ }
};

export default function ConsentNotice({ information, privacyPolicyUrl, language, styles }) {
  if (!information) return null;
  const terms = supportedTermsUrl(information.url);
  const privacy = supportedTermsUrl(privacyPolicyUrl);
  return (
    <View testID="tokenization-consent" style={styles.consentBlock}>
      <Text testID="tokenization-consent-information" style={styles.consentInformation}>
        {t(language, 'CONTINUING_AGREEMENT')}{' '}
        <Text style={styles.consentLink} accessibilityRole={terms ? 'link' : undefined}
          onPress={terms ? () => open(terms) : undefined}>{t(language, 'PAYMENT_DISCLAIMER_2')}</Text>
        {privacy ? <>{' '}{t(language, 'AND')}{' '}<Text style={styles.consentLink} accessibilityRole="link"
          onPress={() => open(privacy)}>{t(language, 'PRIVACY_POLICY')}</Text></> : null}.
      </Text>
    </View>
  );
}
