import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, ActivityIndicator } from 'react-native';
import useReducedMotion from './useReducedMotion';

export default function SelectionStatusView({ status, styles, loadingLabel, confirmedLabel, confirmedMessage, spinnerColor }) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (status !== 'confirmed' || reducedMotion) { scale.setValue?.(1); return undefined; }
    scale.setValue?.(0.75);
    const animation = Animated.timing(scale, { toValue: 1, duration: 320, useNativeDriver: true });
    animation.start();
    return () => { animation.stop?.(); scale.stopAnimation?.(); };
  }, [status, reducedMotion, scale]);
  return (
    <View style={styles.statusContainer} testID={`selection-status-${status}`} accessibilityLiveRegion="polite">
      {status === 'confirmed' ? <>
        <Animated.View style={[styles.selectionSuccessCircle, { transform: [{ scale }] }]} accessibilityElementsHidden>
          <Text style={styles.selectionSuccessMark}>✓</Text>
        </Animated.View>
        <Text style={styles.statusTitle} accessibilityRole="header">{confirmedLabel}</Text>
        {confirmedMessage ? <Text style={styles.statusMessage}>{confirmedMessage}</Text> : null}
      </> : <>
        <ActivityIndicator color={spinnerColor} size="large" animating={!reducedMotion} hidesWhenStopped={false}
          accessibilityLabel={loadingLabel} testID="selection-submitting-spinner" />
        <Text style={styles.loadingLabel}>{loadingLabel}</Text>
      </>}
    </View>
  );
}
