import React from 'react';
import { View } from 'react-native';

const CardSchemeIcon = ({ styles }) => (
  <View style={styles.cardIcon} testID="tokenization-card-icon" accessibilityElementsHidden>
    <View style={styles.cardIconBar} />
  </View>
);

export default CardSchemeIcon;
