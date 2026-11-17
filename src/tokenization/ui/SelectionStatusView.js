import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import useReducedMotion from './useReducedMotion';

export default function SelectionStatusView({ status, styles, loadingLabel, confirmedLabel, confirmedMessage, spinnerColor, successColor }) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const confirmed = status === 'confirmed';
  useEffect(() => {
    scale.setValue(1);
    opacity.setValue(1);
    if (!confirmed || reducedMotion) return undefined;
    scale.setValue(0.84);
    opacity.setValue(0);
    const rise = Animated.timing(scale, { toValue: 1, duration: 380, useNativeDriver: true });
    const fade = Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true });
    rise.start();
    fade.start();
    return () => { rise.stop(); fade.stop(); };
  }, [confirmed, reducedMotion, scale, opacity]);
  return (
    <View style={[styles.statusContainer, confirmed && styles.selectionSuccessContainer]} testID={`selection-status-${status}`} accessibilityLiveRegion="polite">
      {confirmed ? <>
        <Animated.View style={[styles.selectionSuccessCircle, { opacity, transform: [{ scale }] }]}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={32} height={32} viewBox="0 0 32 32" fill="none" accessible={false}>
            <Path d="m8 16 5.5 5.5L24 11" stroke={successColor} strokeWidth={3}
              strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
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
