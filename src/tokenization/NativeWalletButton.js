import React from 'react';
import { Platform, requireNativeComponent } from 'react-native';

let WalletButton;

const nativeButton = () => {
  if (!WalletButton) {
    // Pure JS unit-test mocks do not load the native RN renderer. Production
    // always requires the registered native view; no wallet artwork fallback.
    if (typeof requireNativeComponent !== 'function' && process.env.NODE_ENV === 'test') {
      WalletButton = 'NIWalletButton';
    } else {
      WalletButton = requireNativeComponent('NIWalletButton');
    }
  }
  return WalletButton;
};

const NativeWalletButton = ({
  method,
  disabled = false,
  onPress,
  style,
  testID,
  accessibilityLabel,
}) => {
  const matchesPlatform =
    (method === 'APPLE_PAY' && Platform.OS === 'ios') ||
    (method === 'GOOGLE_PAY' && Platform.OS === 'android');
  if (!matchesPlatform) return null;

  const Button = nativeButton();
  return (
    <Button
      style={[{ height: 56, width: '100%' }, style]}
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (method === 'APPLE_PAY' ? 'Apple Pay' : 'Google Pay')}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={Boolean(disabled)}
      onPress={() => { if (!disabled && typeof onPress === 'function') onPress(); }}
    />
  );
};

export default NativeWalletButton;
