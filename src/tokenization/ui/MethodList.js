import React from 'react';
import { View, Text, Pressable } from 'react-native';
import CardSchemeIcon from './CardSchemeIcon';
import ConsentInformation from './ConsentInformation';

const WALLET_METHODS = ['APPLE_PAY', 'GOOGLE_PAY'];
const methodTestId = (method) => `tokenization-method-${method}`;

const WalletRow = ({ method, styles, payWith, mark, disabled, onSelect }) => (
  <Pressable
    testID={methodTestId(method)}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={`${payWith} ${mark}`}
    onPress={() => onSelect(method)}
    style={({ pressed }) => [
      styles.methodButton,
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
    accessibilityLabel={label}
    onPress={() => onSelect('CARD')}
    style={({ pressed }) => [
      styles.methodButton,
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
  order,
  consent,
  language,
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
          <ConsentInformation
            order={order}
            information={consent}
            language={language}
            styles={styles}
          />
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
          <ConsentInformation
            order={order}
            information={consent}
            language={language}
            styles={styles}
          />
        </View>
      ) : null}
    </View>
  );
};

export default MethodList;
export { methodTestId };
