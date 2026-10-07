import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';

const BounceDots = ({ styles }) => {
  const a = useRef(new Animated.Value(0.3)).current;
  const b = useRef(new Animated.Value(0.3)).current;
  const c = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (value, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 280, useNativeDriver: true }),
          Animated.delay(280),
        ])
      );
    const one = pulse(a, 0);
    const two = pulse(b, 160);
    const three = pulse(c, 320);
    one.start();
    two.start();
    three.start();
    return () => {
      one.stop();
      two.stop();
      three.stop();
    };
  }, [a, b, c]);

  return (
    <View style={styles.dots} testID="tokenization-loading-dots">
      <Animated.View style={[styles.dot, { transform: [{ scale: a }] }]} />
      <Animated.View style={[styles.dot, { transform: [{ scale: b }] }]} />
      <Animated.View style={[styles.dot, { transform: [{ scale: c }] }]} />
    </View>
  );
};

const StatusView = ({
  status,
  styles,
  title,
  message,
  loadingLabel,
  cancelLabel,
  onCancel,
}) => (
  <View style={styles.statusContainer} testID={`tokenization-status-${status}`}>
    {status === 'loading' ? (
      <>
        <BounceDots styles={styles} />
        <Text style={styles.loadingLabel}>{loadingLabel}</Text>
      </>
    ) : null}
    {status === 'success' ? (
      <>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusMessage}>{message}</Text>
      </>
    ) : null}
    {status === 'error' ? (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    ) : null}
    {status === 'loading' ? null : (
      <TouchableOpacity
        testID="tokenization-status-close"
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        style={styles.cancelButton}
        onPress={onCancel}
      >
        <Text style={styles.cancelLabel}>{cancelLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

export default StatusView;
