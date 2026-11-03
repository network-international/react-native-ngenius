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

// NISdk colours are global; restore defaults even on failure so later payments
// do not inherit tokenization branding.
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
