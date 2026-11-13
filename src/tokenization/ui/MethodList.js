import React from 'react';
import { View, Text, Pressable } from 'react-native';
import SecurityIcon from './SecurityIcon';
import NativeWalletButton from '../NativeWalletButton';

const WALLET_METHODS = ['APPLE_PAY', 'GOOGLE_PAY'];
const methodTestId = (method) => `tokenization-method-${method}`;

const WalletRow = ({ method, styles, payWith, label, disabled, onSelect }) => disabled ? (
  <Pressable testID={methodTestId(method)} disabled accessibilityRole="button"
    accessibilityState={{ disabled: true }} accessibilityLabel={label}
    onPress={() => {}} style={[styles.methodButton, styles.blockedWalletRow]}>
    <Text style={styles.blockedWalletLabel}>{label}</Text>
  </Pressable>
) : (
  <NativeWalletButton
    method={method}
    testID={methodTestId(method)}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ disabled: Boolean(disabled) }}
    accessibilityLabel={`${payWith} ${method === 'APPLE_PAY' ? 'Apple Pay' : 'Google Pay'}`}
    onPress={() => { if (!disabled) onSelect(method); }}
    style={[
      styles.methodButton,
      disabled ? styles.methodDisabled : null,
    ]}
  />
);

const CardRow = ({ styles, label, disabled, onSelect, iconColor }) => (
  <Pressable
    testID={methodTestId('CARD')}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ disabled: Boolean(disabled) }}
    accessibilityLabel={label}
    onPress={() => { if (!disabled) onSelect('CARD'); }}
    style={({ pressed }) => [
      styles.methodButton,
      disabled ? styles.methodDisabled : null,
      styles.cardButton,
      pressed ? styles.cardButtonPressed : null,
    ]}
  >
    <SecurityIcon kind="lock" color={iconColor || '#FFFFFF'} />
    <Text style={styles.cardButtonLabel}>{label}</Text>
  </Pressable>
);

const MethodList = ({
  methods,
  styles,
  labels,
  payWithLabel,
  dividerLabel,
  cardSectionLabel,
  disabled,
  onSelect,
  securityLabel,
  buttonIconColor,
}) => {
  const wallets = WALLET_METHODS.filter((method) => methods.includes(method));
  const showCard = methods.includes('CARD');
  const showDivider = wallets.length > 0 && showCard;

  return (
    <View style={styles.methods} testID="tokenization-method-list">
      {wallets.length > 0 ? (
        <View style={styles.walletStack} testID="tokenization-wallet-section">
          {wallets.map((method) => (
            <WalletRow
              key={method}
              method={method}
              styles={styles}
              payWith={payWithLabel}
              label={labels[method]}
              disabled={disabled}
              onSelect={onSelect}
            />
          ))}
        </View>
      ) : null}
      {showDivider ? (
        <View style={styles.dividerRow} testID="tokenization-methods-divider">
          <View style={styles.dividerLine} /><Text style={styles.divider}>{dividerLabel}</Text><View style={styles.dividerLine} />
        </View>
      ) : null}
      {showCard ? (
        <View testID="tokenization-card-section">
          {securityLabel ? <View testID="tokenization-security-note" style={styles.securityNote}>
            <Text style={styles.securityNoteLabel}>• {securityLabel}</Text>
          </View> : null}
          {cardSectionLabel ? <Text style={styles.sectionTitle} testID="tokenization-title">
            {cardSectionLabel}
          </Text> : null}
          <CardRow styles={styles} label={labels.CARD} disabled={disabled} onSelect={onSelect} iconColor={buttonIconColor} />
        </View>
      ) : null}
    </View>
  );
};

export default MethodList;
export { methodTestId };
