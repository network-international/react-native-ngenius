import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export default function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const change = value => { if (active) setReduced(Boolean(value)); };
    const eventChange = value => { preferenceChanged = true; change(value); };
    if (AccessibilityInfo?.isReduceMotionEnabled) {
      AccessibilityInfo.isReduceMotionEnabled()
        .then(value => { if (!preferenceChanged) change(value); })
        .catch(() => { if (!preferenceChanged) change(true); });
    } else {
      change(false);
    }
    const listener = AccessibilityInfo?.addEventListener?.('reduceMotionChanged', eventChange);
    return () => {
      active = false;
      if (listener?.remove) listener.remove();
      else AccessibilityInfo?.removeEventListener?.('reduceMotionChanged', eventChange);
    };
  }, []);
  return reduced;
}
