const { NativeModules, Platform } = require('react-native');

const { NiSdk } = NativeModules;

const applyNativeCardTheme = (nativeColors) => {
  if (Platform.OS !== 'ios' || !NiSdk || typeof NiSdk.setSDKColors !== 'function') {
    return { applied: false, platform: Platform.OS };
  }
  NiSdk.setSDKColors(nativeColors);
  return { applied: true, platform: 'ios' };
};

const resetNativeCardTheme = () => {
  if (Platform.OS !== 'ios' || !NiSdk || typeof NiSdk.resetSDKColors !== 'function') {
    return { reset: false, platform: Platform.OS };
  }
  NiSdk.resetSDKColors();
  return { reset: true, platform: 'ios' };
};

/**
 * iOS NISdk 6.1.0 stores colours on the NISdk singleton via setSDKColors.
 * Colour fields are public Swift properties, applied natively from Swift.
 * Always restore NISdkColors() defaults after the card UI returns,
 * including rejection / throw. Native set/reset are async main-queue
 * calls; JS cannot unit-test the UIKit singleton. This helper only
 * asserts the JS call contract.
 */
const withNativeCardTheme = async (nativeColors, runNativeCard) => {
  applyNativeCardTheme(nativeColors);
  try {
    return await runNativeCard();
  } finally {
    resetNativeCardTheme();
  }
};

module.exports = {
  applyNativeCardTheme,
  resetNativeCardTheme,
  withNativeCardTheme,
};
