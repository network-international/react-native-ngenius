import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, UIManager, View, requireNativeComponent } from 'react-native';
import useReducedMotion from './useReducedMotion';

const { t } = require('../strings');
const BLUR_VIEW = 'NITokenizationBackdropBlur';
const DISMISS_DISTANCE = 80;
let BlurView;

const BackdropBlur = () => {
  if (!BlurView && UIManager?.getViewManagerConfig?.(BLUR_VIEW)) {
    BlurView = requireNativeComponent(BLUR_VIEW);
  }
  return BlurView ? (
    <BlurView style={styles.fill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
  ) : null;
};

const BottomSheet = ({ theme, language, backdropBlur, dismissDisabled, onCancel, children }) => {
  const offsetRef = useRef(null);
  if (offsetRef.current == null) offsetRef.current = new Animated.Value(Dimensions.get('window').height);
  const offset = offsetRef.current;
  const reducedMotion = useReducedMotion(null);
  const dismissal = useRef({ dismissDisabled, onCancel, reducedMotion });
  dismissal.current = { dismissDisabled, onCancel, reducedMotion };

  useEffect(() => {
    if (reducedMotion == null) return undefined;
    if (reducedMotion) {
      offset.setValue(0);
      return undefined;
    }
    const animation = Animated.timing(offset, { toValue: 0, duration: 220, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [offset, reducedMotion]);

  const close = reason => {
    if (!dismissal.current.dismissDisabled) dismissal.current.onCancel?.(reason);
  };

  const gesture = useMemo(() => {
    const reset = () => {
      if (dismissal.current.reducedMotion) offset.setValue(0);
      else Animated.spring(offset, { toValue: 0, overshootClamping: true, useNativeDriver: true }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) => !dismissal.current.dismissDisabled && dy > 8 && dy > Math.abs(dx),
      onPanResponderMove: (_, { dy }) => {
        if (!dismissal.current.reducedMotion) offset.setValue(Math.max(0, dy));
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (!dismissal.current.dismissDisabled && (dy >= DISMISS_DISTANCE || (dy > 18 && vy > 0.75))) {
          dismissal.current.onCancel?.('swipe');
        } else {
          reset();
        }
      },
      onPanResponderTerminate: reset,
    });
  }, [offset]);

  return (
    <View style={styles.root} testID="tokenization-bottom-sheet">
      {backdropBlur ? <BackdropBlur /> : null}
      <Pressable style={[styles.fill, styles.scrim]} testID="tokenization-backdrop" accessibilityRole="button"
        accessibilityLabel={t(language, 'CANCEL')} accessibilityState={{ disabled: dismissDisabled }}
        disabled={dismissDisabled} onPress={() => close('backdrop')} />
      <Animated.View testID="tokenization-sheet-panel" accessibilityViewIsModal
        onAccessibilityEscape={() => close('back')}
        {...gesture.panHandlers}
        style={[styles.panel, { backgroundColor: theme.branding.surfaceBackground },
          reducedMotion == null && styles.pending,
          { transform: [{ translateY: reducedMotion ? 0 : offset }] }]}>
        <View testID="tokenization-sheet-handle" style={styles.handleArea} accessible={false}>
          <View style={[styles.handle, { backgroundColor: theme.layout.colors.border }]} />
        </View>
        {children}
      </Animated.View>
    </View>
  );
};

export default function TokenizationPresentation({ theme, language, modeConfig, dismissDisabled = false, onCancel, children }) {
  if (modeConfig?.presentation === 'fullscreen') return children;
  return (
    <BottomSheet theme={theme} language={language} backdropBlur={modeConfig?.backdropBlur}
      dismissDisabled={dismissDisabled} onCancel={onCancel}>{children}</BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  scrim: { backgroundColor: 'rgba(15, 23, 26, 0.32)' },
  panel: { height: '64%', width: '100%', maxWidth: 560, alignSelf: 'center',
    overflow: 'hidden', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  pending: { opacity: 0 },
  handleArea: { height: 42, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2 },
});
