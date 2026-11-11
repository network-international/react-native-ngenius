import React from 'react';
import { View, Text, Pressable } from 'react-native';
import SavedTokensSkeleton from './SavedTokensSkeleton';
import SchemeIcon from './SchemeIcon';
const { t } = require('../strings');

const formatExpiry = value => {
  if (typeof value !== 'string') return '';
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match ? `${match[2]}/${match[1].slice(2)}` : '';
};

export default function SavedTokens({ value, language, styles, onRetry, selectedTokenRef, onSelectToken, disabled = false, title, hideTitle = false }) {
  if (!value) return null;
  if (value.loading) return <SavedTokensSkeleton styles={styles} label={t(language, 'SAVED_TOKENS_LOADING')} />;
  if (value.failed) return (
    <Pressable testID="saved-tokens-retry" accessibilityRole="button"
      accessibilityLabel={t(language, 'SAVED_TOKENS_RETRY')} style={styles.retryButton}
      onPress={onRetry}>
      <Text style={styles.retryLabel}>{t(language, 'SAVED_TOKENS_RETRY')}</Text>
    </Pressable>
  );
  const tokens = Array.isArray(value.tokens) ? value.tokens.filter(token => token && token.status !== 'FAILED') : [];
  if (!tokens.length) return null;
  const sectionTitle = title || t(language, 'SAVED_TOKENS');
  return (
    <View testID="saved-tokens" style={styles.savedSection} accessibilityLiveRegion="polite">
      {!hideTitle ? <Text style={styles.sectionTitle}>{sectionTitle}</Text> : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={sectionTitle}>
        {tokens.map(token => {
          const available = token.status === 'VERIFIED' && Boolean(token.tokenRef);
          const blocked = disabled || !available || typeof onSelectToken !== 'function';
          const selected = available && token.tokenRef === selectedTokenRef;
          const card = token.cardDetails;
          const wallet = token.type === 'WALLET';
          const funding = card ? `${card.scheme} •••• ${card.last4}` : '';
          const title = funding || t(language, 'SAVED_PAYMENT_METHOD');
          const walletName = token.walletType === 'APPLE_PAY' ? t(language, 'APPLE_PAY') :
            token.walletType === 'GOOGLE_PAY' ? 'Google Pay' : '';
          const badge = [t(language, wallet ? 'WALLET' : 'CARD'), wallet ? walletName : ''].filter(Boolean).join(' / ');
          const expiry = formatExpiry(card?.expiry);
          const statusLabel = available ? '' : t(language, token.status === 'AWAIT_3DS' ? 'SAVED_TOKEN_PENDING' : 'SAVED_TOKEN_UNAVAILABLE');
          const detail = [expiry, statusLabel].filter(Boolean).join(', ');
          return (
            <Pressable key={token.tokenRef} testID="saved-token" accessibilityRole="radio"
              accessibilityLabel={[title, badge, detail, available ? t(language, 'SAVED_TOKEN_VERIFIED') : '', selected ? t(language, 'LOCALLY_SELECTED') : ''].filter(Boolean).join(', ')}
              accessibilityState={{ checked: selected, disabled: blocked }} disabled={blocked}
              onPress={() => { if (!blocked) onSelectToken(token.tokenRef); }}
              style={[styles.savedRow, selected && styles.savedRowSelected, blocked && styles.savedRowDisabled]}>
              <View style={styles.savedScheme} accessibilityElementsHidden>
                <SchemeIcon scheme={card?.scheme} />
              </View>
              <View style={styles.savedDetails}>
                <Text style={styles.savedTitle}>{title}</Text>
                <View style={styles.savedBadges}>
                  {expiry ? <Text testID="saved-token-expiry" style={[styles.savedDescription, styles.expiryDate]}>{expiry}</Text> : null}
                  <Text style={styles.methodTypeBadge}>{badge}</Text>
                  {available ? <View testID="saved-token-verified" style={styles.verifiedBadge}
                    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Text style={styles.verifiedLabel}>✓ {t(language, 'SAVED_TOKEN_VERIFIED')}</Text>
                  </View> : <Text style={styles.savedDescription}>{statusLabel}</Text>}
                </View>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {selected ? <View testID="saved-token-selected-dot" style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
