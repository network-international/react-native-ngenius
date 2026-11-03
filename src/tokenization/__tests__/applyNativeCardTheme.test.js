jest.mock('react-native', () => ({
  NativeModules: {
    NiSdk: {
      setSDKColors: jest.fn(),
      resetSDKColors: jest.fn(),
    },
  },
  Platform: { OS: 'ios' },
}));

const { NativeModules, Platform } = require('react-native');
const { withNativeCardTheme } = require('../applyNativeCardTheme');

describe('withNativeCardTheme', () => {
  beforeEach(() => {
    NativeModules.NiSdk.setSDKColors.mockClear();
    NativeModules.NiSdk.resetSDKColors.mockClear();
    Platform.OS = 'ios';
  });

  it('applies iOS colours then always resets after success', async () => {
    const colors = { payButtonBackgroundColor: '#FFD882' };
    const result = await withNativeCardTheme(colors, async () => 'ok');
    expect(result).toBe('ok');
    expect(NativeModules.NiSdk.setSDKColors).toHaveBeenCalledWith(colors);
    expect(NativeModules.NiSdk.resetSDKColors).toHaveBeenCalledTimes(1);
  });

  it('resets iOS colours when the native card promise rejects', async () => {
    const colors = { payButtonBackgroundColor: '#112233' };
    await expect(
      withNativeCardTheme(colors, async () => {
        const error = { status: 'Failed' };
        throw error;
      })
    ).rejects.toEqual({ status: 'Failed' });
    expect(NativeModules.NiSdk.resetSDKColors).toHaveBeenCalledTimes(1);
  });

  it('does not call iOS colour APIs on Android', async () => {
    Platform.OS = 'android';
    await withNativeCardTheme({ payButtonBackgroundColor: '#112233' }, async () => 'ok');
    expect(NativeModules.NiSdk.setSDKColors).not.toHaveBeenCalled();
    expect(NativeModules.NiSdk.resetSDKColors).not.toHaveBeenCalled();
  });
});
