import React, { useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
const { t } = require('../strings');
const { supportedTermsUrl } = require('../termsUrl');
const ConsentInformation = require('./ConsentInformation');

const open = async url => {
  try { if (await Linking.canOpenURL(url)) await Linking.openURL(url); } catch { /* Keep checkout usable if the browser cannot open. */ }
};

export default function ConsentNotice({ information, privacyPolicyUrl, language, styles }) {
  const [expanded, setExpanded] = useState(false);
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
      {information.key ? <>
        <Pressable testID="tokenization-storage-terms-toggle" accessibilityRole="button"
          accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.storageTermsToggle}>
          <Text style={styles.storageTermsLabel}>{t(language, expanded ? 'HIDE_STORAGE_TERMS' : 'STORAGE_TERMS')}</Text>
        </Pressable>
        {expanded ? <ConsentInformation information={information} language={language} styles={styles} /> : null}
      </> : null}
    </View>
  );
}
