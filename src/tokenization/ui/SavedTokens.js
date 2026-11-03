import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
const { t } = require('../strings');

export default function SavedTokens({ value, language, styles, onRetry }) {
  if (!value) return null;
  return (
    <View testID="saved-tokens" accessibilityLiveRegion="polite">
      <Text style={styles.sectionTitle}>{t(language, 'SAVED_TOKENS')}</Text>
      {value.loading ? (
        <ActivityIndicator
          testID="saved-tokens-loading"
          accessibilityLabel={t(language, 'SAVED_TOKENS_LOADING')}
        />
      ) : value.failed ? (
        <TouchableOpacity
          testID="saved-tokens-retry"
          accessibilityRole="button"
          onPress={onRetry}>
          <Text>{t(language, 'SAVED_TOKENS_RETRY')}</Text>
        </TouchableOpacity>
      ) : value.tokens.length === 0 ? (
        <Text testID="saved-tokens-empty">
          {t(language, 'SAVED_TOKENS_EMPTY')}
        </Text>
      ) : (
        value.tokens.map((token, index) => (
          <Text key={index} testID="saved-token">
            {token.cardDetails
              ? `${token.cardDetails.scheme} •••• ${token.cardDetails.last4} · ${token.cardDetails.expiry}`
              : token.type}
          </Text>
        ))
      )}
    </View>
  );
}
