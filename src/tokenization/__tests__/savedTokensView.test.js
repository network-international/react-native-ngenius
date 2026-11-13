jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image',
  TouchableOpacity: 'TouchableOpacity', SafeAreaView: 'SafeAreaView', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'ios' }, StatusBar: {}, StyleSheet: { create: styles => styles },
  Linking: { canOpenURL: jest.fn().mockResolvedValue(true), openURL: jest.fn() },
  AccessibilityInfo: { isReduceMotionEnabled: jest.fn().mockResolvedValue(true), addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Animated: { View: 'AnimatedView', Value: function Value() { this.setValue = jest.fn(); this.stopAnimation = jest.fn(); },
    loop: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })), sequence: jest.fn(), timing: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })), delay: jest.fn() },
}));
const React = require('react');
const renderer = require('react-test-renderer');
const { act } = renderer;
const { Linking, AccessibilityInfo, Animated, Platform } = require('react-native');
const SavedTokens = require('../ui/SavedTokens').default;
const TokenizationScreen = require('../ui/TokenizationScreen').default;
const { resolveTokenizationTheme } = require('../resolveTheme');
const verified = { tokenRef: 'private-card-one', status: 'VERIFIED', type: 'CARD', cardDetails: { scheme: 'VISA', last4: '1234', expiry: '2030-12' } };
const another = { ...verified, tokenRef: 'private-card-two' };
const pending = { ...verified, tokenRef: 'private-card-pending', status: 'AWAIT_3DS' };
const failed = { ...verified, tokenRef: 'private-card-failed', status: 'FAILED' };
let tree;
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
const byId = id => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id);
const renderScreen = async extra => {
  const props = { theme: resolveTokenizationTheme(), language: 'en', status: 'READY', methods: ['CARD'],
    savedTokens: { tokens: [], loading: false, failed: false }, onSelectMethod: jest.fn(), onCancel: jest.fn(), ...extra };
  await act(async () => { tree = renderer.create(React.createElement(TokenizationScreen, props)); await flush(); });
  return props;
};
beforeEach(() => { AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true); });
afterEach(() => { if (tree) act(() => tree.unmount()); tree = undefined; Platform.OS = 'ios'; jest.clearAllMocks(); });

it('omits the saved-method section after a successful empty response and keeps Add Card available', async () => {
  await renderScreen();
  expect(byId('saved-tokens')).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('No saved payment');
  expect(byId('tokenization-page-title')[0].props.children).toBe('Add payment method');
  expect(byId('tokenization-method-CARD')[0].props.disabled).toBe(false);
});

it('selects verified tokens by reference without conflating matching last4 or displaying references', () => {
  const onSelectToken = jest.fn();
  act(() => { tree = renderer.create(React.createElement(SavedTokens, { value: { tokens: [verified, another, pending, failed] }, language: 'en', styles: {}, selectedTokenRef: another.tokenRef, onSelectToken })); });
  const rows = byId('saved-token');
  expect(rows.map(row => row.props.accessibilityState)).toEqual([
    { checked: false, disabled: false }, { checked: true, disabled: false },
    { checked: false, disabled: true }, { checked: false, disabled: true },
  ]);
  act(() => rows[0].props.onPress());
  expect(onSelectToken).toHaveBeenLastCalledWith(verified.tokenRef);
  act(() => { rows[2].props.onPress(); rows[3].props.onPress(); });
  expect(onSelectToken).toHaveBeenCalledTimes(1);
  rows.forEach(row => expect(row.props.accessibilityRole).toBe('radio'));
  const visible = JSON.stringify(tree.toJSON());
  expect(visible).toContain('1234');
  expect(visible).toContain('Expires 12/30');
  expect(visible).not.toContain('private-card');
  expect(byId('saved-token-selected-dot')).toHaveLength(1);
  expect(byId('saved-token-verified')).toHaveLength(2);
  expect(rows[0].props.accessibilityLabel).toContain('Verified');
  expect(rows[0].props.accessibilityLabel).not.toContain('Selected');
  expect(tree.root.findAll(node => node.type === 'Text' && node.props.children === 'Selected')).toHaveLength(0);
  expect(rows[1].props.accessibilityLabel).toContain('Selected');
  expect(byId('selection-status-confirmed')).toHaveLength(0);
});

it('keeps verification badges independent from local choice and session confirmation', () => {
  const props = { value: { tokens: [verified, another, pending, failed] }, language: 'en', styles: {},
    selectedTokenRef: verified.tokenRef, onSelectToken: jest.fn() };
  act(() => { tree = renderer.create(React.createElement(SavedTokens, props)); });
  const verificationLabels = () => byId('saved-token').map(row => row.props.accessibilityLabel.includes('Verified'));
  expect(verificationLabels()).toEqual([true, true, false, false]);
  expect(byId('saved-token').map(row => row.props.accessibilityState.checked)).toEqual([true, false, false, false]);
  act(() => tree.update(React.createElement(SavedTokens, { ...props, selectedTokenRef: another.tokenRef })));
  expect(verificationLabels()).toEqual([true, true, false, false]);
  expect(byId('saved-token').map(row => row.props.accessibilityState.checked)).toEqual([false, true, false, false]);
  expect(byId('saved-token-selected-check')).toHaveLength(0);
  expect(byId('selection-status-confirmed')).toHaveLength(0);
});

it('distinguishes a saved wallet prominently and renders the funding scheme as native vector artwork', async () => {
  const wallet = { ...verified, tokenRef: 'wallet-ref', type: 'WALLET', walletType: 'APPLE_PAY', cardDetails: { scheme: 'MASTERCARD', last4: '4444', expiry: '2031-07' } };
  await renderScreen({ savedTokens: { tokens: [verified, wallet] }, onSelectToken: jest.fn(), selectedTokenRef: wallet.tokenRef });
  const rows = byId('saved-token');
  expect(rows[0].props.accessibilityLabel).toContain('Card');
  expect(rows[1].props.accessibilityLabel).toContain('MASTERCARD •••• 4444, Wallet / Apple Pay');
  expect(rows[1].props.accessibilityLabel).toContain('Expires 07/31');
  expect(byId('saved-token-funding')).toHaveLength(0);
  expect(tree.root.findAll(node => node.type === 'Text' && node.props.children === 'MASTERCARD •••• 4444')).toHaveLength(1);
  expect(byId('saved-token-expiry').map(node => node.props.children)).toEqual(['Expires 12/30', 'Expires 07/31']);
  expect(byId('scheme-icon-visa')).toHaveLength(1);
  expect(byId('scheme-icon-mastercard')).toHaveLength(1);
  expect(tree.root.findAllByType('Path').length).toBeGreaterThan(1);
  expect(byId('selection-status-confirmed')).toHaveLength(0);
});

it('provides optional selection confirmation and keeps save-new consent separate', async () => {
  const onConfirmSavedToken = jest.fn();
  const props = await renderScreen({ savedTokens: { tokens: [verified, pending] }, onSelectToken: jest.fn(),
    consent: { url: 'https://merchant.test/terms' }, consentAccepted: false, onConsentChange: jest.fn(), onConfirmSavedToken });
  expect(byId('tokenization-confirm-saved')[0].props.disabled).toBe(true);
  act(() => byId('tokenization-confirm-saved')[0].props.onPress());
  expect(onConfirmSavedToken).not.toHaveBeenCalled();
  act(() => tree.update(React.createElement(TokenizationScreen, { ...props, selectedTokenRef: verified.tokenRef })));
  expect(byId('tokenization-confirm-saved')[0].props.disabled).toBe(false);
  expect(byId('tokenization-method-CARD')[0].props.disabled).toBe(false);
  act(() => byId('tokenization-confirm-saved')[0].props.onPress());
  expect(onConfirmSavedToken).toHaveBeenCalledWith(verified.tokenRef);
  expect(props.onSelectMethod).not.toHaveBeenCalled();
  act(() => tree.update(React.createElement(TokenizationScreen, { ...props, selectedTokenRef: pending.tokenRef })));
  expect(byId('tokenization-confirm-saved')[0].props.disabled).toBe(true);
  act(() => tree.update(React.createElement(TokenizationScreen, { ...props, onConfirmSavedToken: undefined })));
  expect(byId('tokenization-confirm-saved')).toHaveLength(0);
});

it('keeps submit progress, confirmed selection, and recoverable errors distinct', async () => {
  const props = await renderScreen({ savedTokens: { tokens: [verified] }, onSelectToken: jest.fn(), selectedTokenRef: verified.tokenRef,
    onConfirmSavedToken: jest.fn(), selectionStatus: 'submitting' });
  expect(byId('selection-submitting-spinner')).toHaveLength(1);
  expect(byId('saved-token')).toHaveLength(0);
  expect(byId('tokenization-cancel')[0].props.disabled).toBe(true);
  expect(byId('selection-status-confirmed')).toHaveLength(0);
  act(() => tree.update(React.createElement(TokenizationScreen, { ...props, selectionStatus: 'failed' })));
  expect(byId('selection-inline-error')).toHaveLength(1);
  expect(byId('saved-token')[0].props.disabled).toBe(false);
  expect(byId('tokenization-confirm-saved')[0].props.disabled).toBe(false);
  expect(byId('selection-status-confirmed')).toHaveLength(0);
  await act(async () => { tree.update(React.createElement(TokenizationScreen, { ...props, selectionStatus: 'confirmed' })); await flush(); });
  expect(byId('selection-status-confirmed')).toHaveLength(1);
  expect(JSON.stringify(tree.toJSON())).toContain('Payment method selected');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Payment method saved');
  expect(props.onCancel).not.toHaveBeenCalled();
  expect(Animated.timing).not.toHaveBeenCalled(); // Reduced motion gives a static check.
});

it('applies configured selection copy only to its matching status', async () => {
  const modeConfig = { labels: { selectionPending: 'Checking selection', selectionSuccessTitle: 'Choice confirmed', selectionSuccessMessage: 'Returning to the merchant.', selectionError: 'Choose a different saved method.' } };
  const props = await renderScreen({ savedTokens: { tokens: [verified] }, onSelectToken: jest.fn(), selectedTokenRef: verified.tokenRef,
    modeConfig, selectionStatus: 'submitting' });
  expect(JSON.stringify(tree.toJSON())).toContain('Checking selection');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Choice confirmed');
  act(() => tree.update(React.createElement(TokenizationScreen, { ...props, selectionStatus: 'failed' })));
  expect(JSON.stringify(tree.toJSON())).toContain('Choose a different saved method.');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Returning to the merchant.');
  await act(async () => { tree.update(React.createElement(TokenizationScreen, { ...props, selectionStatus: 'confirmed' })); await flush(); });
  expect(JSON.stringify(tree.toJSON())).toContain('Choice confirmed');
  expect(JSON.stringify(tree.toJSON())).toContain('Returning to the merchant.');
});

it('cleans up the selection confirmation animation on close', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(false);
  const stop = jest.fn();
  Animated.timing.mockReturnValueOnce({ start: jest.fn(), stop });
  await renderScreen({ selectionStatus: 'confirmed' });
  act(() => tree.unmount()); tree = undefined;
  expect(stop).toHaveBeenCalledTimes(1);
});

it.each(['button', 'link', 'text'])('shows an explicit configurable return control with a sufficient hit area as %s', async returnButtonStyle => {
  const props = await renderScreen({ modeConfig: { returnButtonName: 'Return to merchant', returnButtonStyle, labels: { pageTitle: 'Choose a method', addCard: 'Save a new card' } } });
  const control = byId('tokenization-cancel')[0];
  expect(control.props.accessibilityLabel).toBe('Return to merchant');
  expect(control.props.accessibilityRole).toBe(returnButtonStyle === 'link' ? 'link' : 'button');
  expect(control.props.style[0].minHeight).toBeGreaterThanOrEqual(44);
  expect(byId('tokenization-page-title')[0].props.children).toBe('Choose a method');
  expect(byId('tokenization-method-CARD')[0].props.accessibilityLabel).toBe('Save a new card');
  act(() => control.props.onPress());
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

it.each(['success', 'empty'])('omits redundant list %s feedback', async importStatus => {
  await renderScreen({ importStatus, savedTokens: { tokens: importStatus === 'success' ? [verified] : [], failed: false } });
  expect(byId(`token-import-${importStatus}`)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Saved payment methods loaded');
});
it('keeps an actionable load failure without a false success message', async () => {
  await renderScreen({ importStatus: 'error' });
  expect(byId('token-import-error')).toHaveLength(1);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Payment method saved');
});

it('announces loading and hides actionable methods until the list resolves', async () => {
  const props = await renderScreen({ savedTokens: { loading: true, tokens: [] } });
  expect(byId('saved-tokens-loading')[0].props.accessibilityState.busy).toBe(true);
  expect(byId('tokenization-method-CARD')).toHaveLength(0);
  expect(byId('tokenization-consent')).toHaveLength(0);
  act(() => tree.update(React.createElement(TokenizationScreen, { ...props, savedTokens: { loading: false, tokens: [] } })));
  expect(byId('saved-tokens-loading')).toHaveLength(0);
  expect(byId('tokenization-method-CARD')).toHaveLength(1);
});

it('allows list retry and hides saved rows while native verification is busy', async () => {
  const onRetrySavedTokens = jest.fn();
  const props = await renderScreen({ savedTokens: { failed: true, tokens: [] }, onRetrySavedTokens });
  act(() => byId('saved-tokens-retry')[0].props.onPress());
  expect(onRetrySavedTokens).toHaveBeenCalledTimes(1);
  act(() => tree.update(React.createElement(TokenizationScreen, { ...props, status: 'VERIFYING', savedTokens: { tokens: [verified] } })));
  expect(byId('saved-token')).toHaveLength(0);
  expect(byId('tokenization-method-CARD')).toHaveLength(0);
  expect(byId('tokenization-status-VERIFYING')).toHaveLength(1);
  expect(byId('tokenization-cancel')[0].props.accessibilityState.disabled).toBe(true);
  act(() => byId('tokenization-cancel')[0].props.onPress());
  expect(props.onCancel).not.toHaveBeenCalled();
});

it.each([['ios', 'APPLE_PAY'], ['android', 'GOOGLE_PAY']])(
  'shows the official wallet button beside a passive notice on %s', async (platform, method) => {
    Platform.OS = platform;
    const props = await renderScreen({ methods: ['CARD', method], consent: { url: 'https://merchant.test/terms' } });
    expect(byId('tokenization-consent-checkbox')).toHaveLength(0);
    const button = byId(`tokenization-method-${method}`)[0];
    expect(button.type).toBe('NIWalletButton');
    expect(button.props.disabled).toBe(false);
    expect(byId('tokenization-consent')).toHaveLength(1);
    act(() => button.props.onPress());
    expect(props.onSelectMethod).toHaveBeenCalledWith(method);
  }
);

it.each(['en', 'fr', 'ar'])('keeps terms independent and navigation localized in %s', async language => {
  const props = await renderScreen({ language, consent: { url: 'https://merchant.test/terms' } });
  const link = tree.root.findAll(node => node.type === 'Text' && node.props.accessibilityRole === 'link')[0];
  await act(async () => { await link.props.onPress(); await flush(); });
  expect(Linking.openURL).toHaveBeenCalledWith('https://merchant.test/terms');
  expect(props.onSelectMethod).not.toHaveBeenCalled();
  expect(byId('tokenization-consent-checkbox')).toHaveLength(0);
  expect(byId('tokenization-cancel')[0].props.accessibilityLabel).toBe(require('../strings').t(language, 'CONTINUE_SHOPPING'));
  act(() => byId('tokenization-cancel')[0].props.onPress());
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

it('shows the supplied title/subtitle and shield without inventing order fields or privacy links', async () => {
  await renderScreen({ modeConfig: { labels: { pageTitle: 'Complete your booking', pageSubtitle: 'Choose your preferred way to pay.' } } });
  expect(byId('tokenization-page-title')[0].props.children).toBe('Complete your booking');
  expect(byId('tokenization-page-subtitle')).toHaveLength(1);
  expect(byId('tokenization-security-shield')).toHaveLength(1);
  expect(byId('tokenization-powered-by')).toHaveLength(1);
  expect(byId('tokenization-order-summary')).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Privacy Policy');
});

it('keeps skip-consent free of the notice and allows hiding the factual security note', async () => {
  await renderScreen({ modeConfig: { showSecurityNote: false } });
  expect(byId('tokenization-consent')).toHaveLength(0);
  expect(byId('tokenization-security-note')).toHaveLength(0);
  expect(byId('tokenization-security-shield')).toHaveLength(1);
});

it('shows original recurring terms only on expansion and omits unsafe policy links', async () => {
  await renderScreen({ consent: { key: 'SUBSCRIPTION_TERMS_AND_CONDITIONS', url: 'https://merchant.test/terms' },
    modeConfig: { privacyPolicyUrl: 'javascript:alert(1)' } });
  expect(JSON.stringify(tree.toJSON())).not.toContain('charged the specified amount');
  act(() => byId('tokenization-storage-terms-toggle')[0].props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('charged the specified amount');
  expect(JSON.stringify(tree.toJSON())).not.toContain('javascript:');
});

it('uses static loading placeholders when reduced motion is enabled', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
  await renderScreen({ savedTokens: { loading: true, tokens: [] } });
  expect(Animated.loop).not.toHaveBeenCalled();
});

it('stops loading animations and removes the motion listener when disposed', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(false);
  const stop = jest.fn();
  const remove = jest.fn();
  Animated.loop.mockReturnValue({ start: jest.fn(), stop });
  AccessibilityInfo.addEventListener.mockReturnValue({ remove });
  await renderScreen({ savedTokens: { loading: true, tokens: [] } });
  act(() => tree.unmount()); tree = undefined;
  expect(stop).toHaveBeenCalled();
  expect(remove).toHaveBeenCalled();
});

it('renders only the supplied order data and honors the configured initial disclosure state', async () => {
  const { normalizeOrderDetails } = require('../orderDetails');
  await renderScreen({ modeConfig: { orderSummaryInitiallyExpanded: true }, orderSummary: normalizeOrderDetails({ orderDetails: {
    amount: { currencyCode: 'AED', value: '3910' }, orderSummary: { items: [{ description: 'A supplied item', totalPrice: { currencyCode: 'AED', value: '3910' } }] },
  } }) });
  expect(byId('order-summary-amount')[0].props.children).toBe('AED 39.10');
  expect(byId('order-summary-item')).toHaveLength(1);
  expect(byId('order-summary-tax')).toHaveLength(0);
  expect(byId('order-summary-shipping')).toHaveLength(0);
  act(() => byId('order-summary-header')[0].props.onPress());
  expect(byId('order-summary-item')).toHaveLength(0);
});

it.each([
  ['AMERICAN_EXPRESS', 'americanexpress'], ['DINERS_CLUB', 'dinersclub'], ['DISCOVER', 'discover'],
  ['JCB', 'jcb'], ['UNIONPAY', 'unionpay'], ['MC', 'mc'], ['CUP', 'cup'], ['UNKNOWN', 'card'],
])('renders the PayPage artwork or generic fallback for %s', async (scheme, icon) => {
  await renderScreen({ savedTokens: { tokens: [{ ...verified, cardDetails: { ...verified.cardDetails, scheme } }] } });
  expect(byId(`scheme-icon-${icon}`)).toHaveLength(1);
});
