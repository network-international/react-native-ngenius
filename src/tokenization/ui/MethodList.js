import React from 'react';
import { View, Text, Pressable } from 'react-native';
import CardSchemeIcon from './CardSchemeIcon';

const WALLET_METHODS = ['APPLE_PAY', 'GOOGLE_PAY'];
const methodTestId = (method) => `tokenization-method-${method}`;

const WalletRow = ({ method, styles, payWith, mark, disabled, onSelect }) => (
  <Pressable
    testID={methodTestId(method)}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ disabled: Boolean(disabled) }}
    accessibilityLabel={`${payWith} ${mark}`}
    onPress={() => { if (!disabled) onSelect(method); }}
    style={({ pressed }) => [
      styles.methodButton,
      disabled ? styles.methodDisabled : null,
      styles.walletButton,
      pressed ? styles.walletButtonPressed : null,
    ]}
  >
    <Text style={styles.walletPayWith}>{payWith}</Text>
    <Text style={styles.walletMark}>{mark}</Text>
  </Pressable>
);

const CardRow = ({ styles, label, disabled, onSelect }) => (
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
    <CardSchemeIcon styles={styles} />
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
              mark={labels[method]}
              disabled={disabled}
              onSelect={onSelect}
            />
          ))}
        </View>
      ) : null}
      {showDivider ? (
        <Text style={styles.divider} testID="tokenization-methods-divider">
          {dividerLabel}
        </Text>
      ) : null}
      {showCard ? (
        <View testID="tokenization-card-section">
          <Text style={styles.sectionTitle} testID="tokenization-title">
            {cardSectionLabel}
          </Text>
          <CardRow styles={styles} label={labels.CARD} disabled={disabled} onSelect={onSelect} />
        </View>
      ) : null}
    </View>
  );
};

export default MethodList;
export { methodTestId };
