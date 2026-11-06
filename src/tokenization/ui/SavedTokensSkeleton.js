import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import useReducedMotion from './useReducedMotion';

export default function SavedTokensSkeleton({ styles, label }) {
  const opacity = useRef(new Animated.Value(0.55)).current;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) { opacity.setValue?.(0.55); return undefined; }
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => { pulse.stop(); opacity.stopAnimation?.(); };
  }, [opacity, reducedMotion]);
  return (
    <View testID="saved-tokens-loading" accessible accessibilityRole="progressbar"
      accessibilityLabel={label} accessibilityState={{ busy: true }}>
      <Animated.View style={{ opacity }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map(index => (
          <View key={index} style={styles.skeletonRow}>
            <View style={styles.skeletonIcon} />
            <View style={styles.savedDetails}>
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, styles.skeletonShortLine]} />
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
