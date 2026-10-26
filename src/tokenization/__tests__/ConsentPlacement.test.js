jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image', Modal: 'Modal',
  SafeAreaView: 'SafeAreaView', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
  ActivityIndicator: 'ActivityIndicator',
  Animated: { View: 'AnimatedView', Value: function Value(v) { this.value = v; },
    loop: () => ({ start() {}, stop() {} }), sequence: () => ({}), delay: () => ({}), timing: () => ({}) },
  Platform: { OS: 'android' }, StatusBar: { currentHeight: 24 }, NativeModules: {},
  StyleSheet: { create: (styles) => styles },
  Linking: { canOpenURL: jest.fn().mockResolvedValue(true), openURL: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../nativePayments', () => ({
  initiateCardPayment: jest.fn().mockResolvedValue({ status: 'Success' }),
  initiateApplePay: jest.fn().mockResolvedValue({ status: 'Success' }),
  initiateGooglePay: jest.fn().mockResolvedValue({ status: 'Success', token: 'opaque-wallet' }),
  isApplePaySupported: jest.fn().mockResolvedValue(true),
  isGooglePaySupported: jest.fn().mockResolvedValue(true),
}));

const React = require('react');
const renderer = require('react-test-renderer');
const { act } = renderer;
const { Platform, Linking } = require('react-native');
const NgeniusTokenization = require('../NgeniusTokenization').default;
const TokenizationScreen = require('../ui/TokenizationScreen').default;
const native = require('../../nativePayments');
const { resolveTokenizationTheme } = require('../resolveTheme');
const { resolveConsentInformation } = require('../consentInformation');
const order = { action: 'VERIFY', paymentMethods: { card: ['VISA'], wallet: ['GOOGLE_PAY', 'APPLE_PAY'] } };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { resolve, promise }; };
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
let tree;
let props;
const byId = (id) => tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === id);
const checkbox = () => byId('tokenization-consent-checkbox')[0];
const press = async (node) => act(async () => { node.props.onPress(); await flush(); });
const open = async (extra = {}) => {
  props = { visible: true, order, paymentMethods: ['CARD', 'APPLE_PAY', 'GOOGLE_PAY'],
    outletRef: 'outlet', tokenizationClient: { getSavedTokens: jest.fn().mockResolvedValue({ tokens: [], tncUrl: 'https://backend.example/terms' }), addWallet: jest.fn() },
    onSuccess: jest.fn(), onError: jest.fn(), onCancel: jest.fn(), ...extra };
  await act(async () => { tree = renderer.create(React.createElement(NgeniusTokenization, props)); await flush(); });
};
const update = async (extra) => {
  props = { ...props, ...extra };
  await act(async () => { tree.update(React.createElement(NgeniusTokenization, props)); await flush(); });
};
const select = async (method) => {
  await act(async () => { tree.root.findByType(TokenizationScreen).props.onSelectMethod(method); await flush(); });
};

beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'android'; });
afterEach(() => { if (tree) act(() => tree.unmount()); tree = undefined; jest.useRealTimers(); });

it.each([undefined, false, true])('loads saved tokens in skipConsent=%p and controls checkbox visibility', async (skipConsent) => {
  await open({ skipConsent });
  expect(props.tokenizationClient.getSavedTokens).toHaveBeenCalledTimes(1);
  expect(props.tokenizationClient.getSavedTokens).toHaveBeenCalledWith({ outletRef: 'outlet' });
  expect(byId('tokenization-consent')).toHaveLength(skipConsent === true ? 0 : 1);
  expect(byId('tokenization-consent-checkbox')).toHaveLength(skipConsent === true ? 0 : 1);
  if (skipConsent !== true) expect(checkbox().props.accessibilityState).toEqual({ checked: false });
});

it.each(['CARD', 'APPLE_PAY', 'GOOGLE_PAY'])('blocks %s buttons and action handlers before acceptance', async (method) => {
  Platform.OS = method === 'APPLE_PAY' ? 'ios' : 'android';
  await open();
  expect(byId(`tokenization-method-${method}`)[0].props.disabled).toBe(true);
  await press(byId(`tokenization-method-${method}`)[0]);
  await select(method); // Bypass disabled styling to exercise the owning handler.
  expect(native.initiateCardPayment).not.toHaveBeenCalled();
  expect(native.initiateApplePay).not.toHaveBeenCalled();
  expect(native.initiateGooglePay).not.toHaveBeenCalled();
  expect(props.tokenizationClient.addWallet).not.toHaveBeenCalled();
});

it.each(['CARD', 'APPLE_PAY', 'GOOGLE_PAY'])('allows %s after explicit acceptance with duplicate protection', async (method) => {
  Platform.OS = method === 'APPLE_PAY' ? 'ios' : 'android';
  const capture = deferred();
  const fn = native[{ CARD: 'initiateCardPayment', APPLE_PAY: 'initiateApplePay', GOOGLE_PAY: 'initiateGooglePay' }[method]];
  fn.mockReturnValueOnce(capture.promise);
  props = undefined;
  await open();
  await press(checkbox());
  expect(checkbox().props.accessibilityState.checked).toBe(true);
  expect(byId(`tokenization-method-${method}`)[0].props.disabled).toBe(false);
  const handler = tree.root.findByType(TokenizationScreen).props.onSelectMethod;
  await act(async () => { handler(method); handler(method); await flush(); });
  if (Platform.OS === 'ios') await act(async () => { tree.root.findByType('Modal').props.onDismiss(); await flush(); });
  expect(fn).toHaveBeenCalledTimes(1);
  await act(async () => { capture.resolve({ status: 'Success', token: 'opaque-wallet' }); await flush(); });
  expect(fn).toHaveBeenCalledWith(order, ...(method === 'CARD' ? [] : [undefined]));
  if (method === 'GOOGLE_PAY') expect(props.tokenizationClient.addWallet).toHaveBeenCalledWith({ outletRef: 'outlet', walletType: 'GOOGLE_PAY', encryptedPayload: 'opaque-wallet' });
  else expect(props.onSuccess).toHaveBeenCalledTimes(1);
});

it('allows skipConsent immediately and renders no consent block, link or reserved spacing', async () => {
  await open({ skipConsent: true });
  expect(byId('tokenization-consent')).toHaveLength(0);
  expect(byId('tokenization-consent-information')).toHaveLength(0);
  expect(tree.root.findAll((node) => node.props.accessibilityRole === 'link')).toHaveLength(0);
  expect(byId('tokenization-method-CARD')[0].props.disabled).toBe(false);
  await select('CARD');
  expect(native.initiateCardPayment).toHaveBeenCalledTimes(1);
});

it.each(['en', 'fr', 'ar'])('keeps the terms link independently clickable and supports accessibility/RTL in %s', async (language) => {
  await open({ language });
  expect(checkbox().props.accessibilityRole).toBe('checkbox');
  expect(checkbox().props.accessibilityLabel).toBe(require('../strings').t(language, 'CONSENT_ACCEPT'));
  const link = tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'link')[0];
  await press(link);
  expect(Linking.openURL).toHaveBeenCalledWith('https://backend.example/terms');
  expect(checkbox().props.accessibilityState.checked).toBe(false);
  expect(checkbox().props.style.flexDirection).toBe(language === 'ar' ? 'row-reverse' : 'row');
});

it('resets acceptance on cancel, close and reopen', async () => {
  await open();
  await press(checkbox());
  await press(byId('tokenization-cancel')[0]);
  expect(checkbox().props.accessibilityState.checked).toBe(false);
  expect(props.onCancel).toHaveBeenCalledTimes(1);
  await select('CARD');
  expect(native.initiateCardPayment).not.toHaveBeenCalled();
  await update({ visible: false });
  await update({ visible: true });
  expect(checkbox().props.accessibilityState.checked).toBe(false);
  await press(checkbox());
  await update({ visible: false });
  await update({ visible: true });
  expect(checkbox().props.accessibilityState.checked).toBe(false);
  expect(props.tokenizationClient.getSavedTokens).toHaveBeenCalledTimes(3);
});

it('ignores old saved-token responses after close/reopen', async () => {
  const first = deferred();
  const getSavedTokens = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ tokens: [], tncUrl: 'https://new.example/terms' });
  await open({ tokenizationClient: { getSavedTokens } });
  await update({ visible: false });
  await update({ visible: true });
  await act(async () => { first.resolve({ tokens: [], tncUrl: 'https://stale.example/terms' }); await flush(); });
  await press(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'link')[0]);
  expect(Linking.openURL).toHaveBeenLastCalledWith('https://new.example/terms');
});

it('does not apply a native response to a newer session', async () => {
  const capture = deferred();
  native.initiateCardPayment.mockReturnValueOnce(capture.promise);
  await open();
  await press(checkbox());
  await select('CARD');
  await update({ visible: false });
  await update({ visible: true });
  await act(async () => { capture.resolve({ status: 'Success' }); await flush(); });
  expect(props.onSuccess).not.toHaveBeenCalled();
  expect(checkbox().props.accessibilityState.checked).toBe(false);
});

it('does not submit a wallet captured by a closed session', async () => {
  const capture = deferred();
  native.initiateGooglePay.mockReturnValueOnce(capture.promise);
  await open();
  await press(checkbox());
  await select('GOOGLE_PAY');
  await update({ visible: false });
  await update({ visible: true });
  await act(async () => { capture.resolve({ token: 'opaque-wallet' }); await flush(); });
  expect(props.tokenizationClient.addWallet).not.toHaveBeenCalled();
  expect(props.onSuccess).not.toHaveBeenCalled();
});

it('keeps acceptance gated when terms loading fails and ignores merchant URL overrides', async () => {
  await open({ tokenizationClient: { getSavedTokens: jest.fn().mockRejectedValue(new Error('offline')) }, tncUrl: 'https://injected.example' });
  expect(byId('tokenization-consent-checkbox')).toHaveLength(1);
  expect(byId('tokenization-method-CARD')[0].props.disabled).toBe(true);
  expect(tree.root.findAll((node) => node.props.accessibilityRole === 'link')).toHaveLength(0);
});

it('ignores a wallet save response belonging to a previous session', async () => {
  const save = deferred();
  await open({ tokenizationClient: {
    getSavedTokens: jest.fn().mockResolvedValue({ tokens: [] }), addWallet: jest.fn().mockReturnValue(save.promise),
  } });
  await press(checkbox());
  await select('GOOGLE_PAY');
  expect(props.tokenizationClient.addWallet).toHaveBeenCalledTimes(1);
  await update({ visible: false });
  await update({ visible: true });
  await act(async () => { save.resolve({ status: 'VERIFIED', tokenRef: 'old-token' }); await flush(); });
  expect(props.onSuccess).not.toHaveBeenCalled();
  expect(props.onError).not.toHaveBeenCalled();
  expect(checkbox().props.accessibilityState.checked).toBe(false);
});

it('invalidates outstanding native work on unmount', async () => {
  const capture = deferred();
  native.initiateCardPayment.mockReturnValueOnce(capture.promise);
  await open({ skipConsent: true });
  await select('CARD');
  act(() => tree.unmount()); tree = undefined;
  await act(async () => { capture.resolve({ status: 'Success' }); await flush(); });
  expect(props.onSuccess).not.toHaveBeenCalled();
});

it('does not launch deferred iOS Card presentation after the session closes', async () => {
  Platform.OS = 'ios';
  await open({ skipConsent: true });
  await select('CARD');
  const dismiss = tree.root.findByType('Modal').props.onDismiss;
  await update({ visible: false });
  await act(async () => { dismiss(); await flush(); });
  expect(native.initiateCardPayment).not.toHaveBeenCalled();
});

it.each(['CARD', 'GOOGLE_PAY'])('clears acceptance when %s native capture is cancelled', async (method) => {
  native[method === 'CARD' ? 'initiateCardPayment' : 'initiateGooglePay']
    .mockRejectedValueOnce({ status: 'Aborted' });
  await open();
  await press(checkbox());
  await select(method);
  expect(checkbox().props.accessibilityState.checked).toBe(false);
  expect(byId(`tokenization-method-${method}`)[0].props.disabled).toBe(true);
  expect(props.onSuccess).not.toHaveBeenCalled();
  expect(props.tokenizationClient.addWallet).not.toHaveBeenCalled();
});
