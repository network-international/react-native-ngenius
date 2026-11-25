import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Platform, Pressable, StyleSheet, UIManager, View, requireNativeComponent } from 'react-native';
import useReducedMotion from './useReducedMotion';

const { t } = require('../strings');
const BLUR_VIEW = 'NITokenizationBackdropBlur';
const DISMISS_DISTANCE = 80;
export const SHEET_HEIGHT_FRACTION = 0.64;
export const SHEET_MAX_WIDTH = 560;
let BlurView;

const BackdropBlur = () => {
  if (!BlurView && UIManager?.getViewManagerConfig?.(BLUR_VIEW)) {
    BlurView = requireNativeComponent(BLUR_VIEW);
  }
  return BlurView ? (
    <BlurView style={styles.fill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
  ) : null;
};

const BottomSheet = ({ theme, language, backdropBlur, dismissDisabled, onCancel, shown, covered, onSheetLayout, children }) => {
  const height = Dimensions.get('window').height;
  const offset = useRef(new Animated.Value(height)).current;
  const reducedMotion = useReducedMotion(null);
  const dismissal = useRef({ dismissDisabled, onCancel, reducedMotion });
  dismissal.current = { dismissDisabled, onCancel, reducedMotion };

  useEffect(() => {
    if (!shown) {
      offset.setValue(height);
      return undefined;
    }
    if (reducedMotion == null) return undefined;
    if (reducedMotion) {
      offset.setValue(0);
      return undefined;
    }
    const animation = Animated.timing(offset, {
      toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [height, offset, reducedMotion, shown]);

  const close = reason => {
    if (!dismissal.current.dismissDisabled) dismissal.current.onCancel?.(reason);
  };

  const gesture = useMemo(() => {
    const reset = () => {
      if (dismissal.current.reducedMotion) offset.setValue(0);
      else Animated.spring(offset, { toValue: 0, overshootClamping: true, useNativeDriver: true }).start();
    };
    const handlers = {
      onMoveShouldSetPanResponder: (_, { dx, dy }) => !dismissal.current.dismissDisabled && dy > 8 && dy > Math.abs(dx),
      onPanResponderGrant: () => offset.stopAnimation(),
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
      onPanResponderTerminationRequest: () => false,
    };
    return {
      panel: PanResponder.create(handlers),
      handle: PanResponder.create({
        ...handlers,
        onStartShouldSetPanResponder: () => !dismissal.current.dismissDisabled,
        onStartShouldSetPanResponderCapture: () => !dismissal.current.dismissDisabled,
      }),
    };
  }, [offset]);

  return (
    <View style={styles.root} testID="tokenization-bottom-sheet"
      accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
      <Animated.View style={[styles.fill, { opacity: offset.interpolate({
        inputRange: [0, height], outputRange: [1, 0], extrapolate: 'clamp',
      }) }]}>
        {backdropBlur ? <BackdropBlur /> : null}
        <Pressable style={[styles.fill, styles.scrim]} testID="tokenization-backdrop" accessibilityRole="button"
          accessibilityLabel={t(language, 'CANCEL')} accessibilityState={{ disabled: dismissDisabled }}
          disabled={dismissDisabled} onPress={() => close('backdrop')} />
      </Animated.View>
      <Animated.View testID="tokenization-sheet-panel" accessibilityViewIsModal={!covered}
        onLayout={onSheetLayout}
        onAccessibilityEscape={() => close('back')}
        {...gesture.panel.panHandlers}
        style={[styles.panel, { backgroundColor: theme.branding.surfaceBackground },
          covered && Platform.OS === 'android' && styles.coveredPanel,
          { transform: [{ translateY: offset }] }]}>
        <View testID="tokenization-sheet-handle" style={styles.handleArea} accessible={false}
          {...gesture.handle.panHandlers}>
          <View pointerEvents="none" style={[styles.handle, { backgroundColor: theme.layout.colors.border }]} />
        </View>
        {children}
      </Animated.View>
    </View>
  );
};

export default function TokenizationPresentation({ theme, language, modeConfig, dismissDisabled = false, onCancel, shown = true, covered = false, onSheetLayout, children }) {
  if (modeConfig?.presentation === 'fullscreen') return children;
  return (
    <BottomSheet theme={theme} language={language} backdropBlur={modeConfig?.backdropBlur}
      dismissDisabled={dismissDisabled} onCancel={onCancel} shown={shown} covered={covered} onSheetLayout={onSheetLayout}>{children}</BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  scrim: { backgroundColor: 'rgba(15, 23, 26, 0.32)' },
  panel: { height: `${SHEET_HEIGHT_FRACTION * 100}%`, width: '100%', maxWidth: SHEET_MAX_WIDTH, alignSelf: 'center',
    overflow: 'hidden', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  // Android also resizes the chooser behind the native dialog when the keyboard opens.
  coveredPanel: { opacity: 0 },
  handleArea: { height: 32, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2 },
});
