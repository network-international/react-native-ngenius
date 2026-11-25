import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import useReducedMotion from './useReducedMotion';

export default function SelectionStatusView({ styles, loadingLabel, spinnerColor }) {
  const reducedMotion = useReducedMotion();
  return (
    <View style={styles.statusContainer} testID="selection-status-submitting" accessibilityLiveRegion="polite">
      <ActivityIndicator color={spinnerColor} size="large" animating={!reducedMotion} hidesWhenStopped={false}
        accessibilityLabel={loadingLabel} testID="selection-submitting-spinner" />
      <Text style={styles.loadingLabel}>{loadingLabel}</Text>
    </View>
  );
}
