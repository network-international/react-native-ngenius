// The tokenization demo must not bootstrap the older sample's direct-payment
// configuration. These factories fail if a future entry imports that graph.
jest.mock('../../../SimpleIntegration/src/config', () => {
  throw new Error('Legacy gateway config must not be loaded by the tokenization demo');
}, { virtual: true });
jest.mock('../../../SimpleIntegration/src/ngenius-apis', () => {
  throw new Error('Legacy direct-payment APIs must not be loaded by the tokenization demo');
});
jest.mock('react-native', () => ({ SafeAreaView: 'SafeAreaView', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, View: 'View', Text: 'Text', TextInput: 'TextInput', Switch: 'Switch', TouchableOpacity: 'TouchableOpacity', Alert: { alert: jest.fn() }, Keyboard: { dismiss: jest.fn() } }));
jest.mock('@network-international/react-native-ngenius', () => ({
  NgeniusTokenization: 'NgeniusTokenization',
  createTokenizationClient: jest.fn(() => ({})),
}), { virtual: true });
const React = require('react');
const renderer = require('react-test-renderer');
const { act } = renderer;
const { Alert } = require('react-native');
const sdk = require('@network-international/react-native-ngenius');
const { default: QA, previewTransport } = require('../../../SimpleIntegration/src/tokenization-qa');
let tree;
const byId = testID => tree.root.findByProps({ testID }).props;
const press = testID => act(() => byId(testID).onPress());
const continueToMerchant = () => press('qa-continue');
const setLiveConnection = () => {
  act(() => {
    byId('qa-base-url').onChangeText(' https://sdk-test.invalid/ ');
    byId('qa-outlet-ref').onChangeText(' merchant-outlet ');
  });
};
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; jest.clearAllMocks(); });
it('opens preview without a credential exchange or network and supports all demo languages', () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  act(() => byId('qa-preview').onValueChange(true));
  press('qa-appearance-options');
  for (const language of ['en', 'fr', 'ar']) {
    continueToMerchant();
    act(() => { tree.root.findByProps({ testID: 'qa-open-tokenization' }).props.onPress(); });
    const screen = tree.root.findByType('NgeniusTokenization');
    expect(screen.props.language).toBe(language);
    expect(screen.props.sessionRef).toBe('preview-session');
    expect(screen.props.skipConsent).toBe(true);
    expect(screen.props.modeConfig.addCardsBeforePay).toBe(false);
    expect(screen.props.modeConfig.labels.payByCard).toBe(require('../strings').t(language, 'ADD_NEW_CARD'));
    act(() => screen.props.onCancel());
    press('qa-edit-settings');
    press('qa-language');
  }
});
it('keeps the runtime token out of props/storage and clears its provider on close', async () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  expect(tree.root.findByProps({ testID: 'qa-access-token' }).props.secureTextEntry).toBe(true);
  expect(tree.root.findByProps({ testID: 'qa-session-ref' }).props.secureTextEntry).toBe(true);
  const input = byId;
  setLiveConnection();
  act(() => input('qa-access-token').onChangeText('Bearer fixture-short-lived'));
  act(() => input('qa-session-ref').onChangeText(' merchant-session '));
  continueToMerchant();
  act(() => { tree.root.findByProps({ testID: 'qa-open-tokenization' }).props.onPress(); });
  const provider = sdk.createTokenizationClient.mock.calls.find(([options]) => options.baseUrl === 'https://sdk-test.invalid')[0].getAccessToken;
  await expect(provider()).resolves.toBe('fixture-short-lived');
  const screen = tree.root.findByType('NgeniusTokenization');
  expect(screen.props.skipConsent).toBe(true);
  expect(screen.props.sessionRef).toBe('merchant-session');
  expect(screen.props.modeConfig.tokenType).toBe('ONCE_OFF');
  expect(screen.props.modeConfig.addCardsBeforePay).toBe(false);
  expect(screen.props.modeConfig.labels.payByCard).toBe('Add new card');
  expect(screen.props.outletRef).toBe('merchant-outlet');
  expect(screen.props.branding).toBeUndefined();
  expect(JSON.stringify(screen.props)).not.toContain('fixture-short-lived');
  expect(tree.root.findAllByType('TextInput')).toHaveLength(0);
  act(() => screen.props.onCancel());
  await expect(provider()).rejects.toThrow('short-lived');
  press('qa-edit-settings');
  expect(input('qa-access-token').value).toBe('');
  expect(input('qa-session-ref').value).toBe('');
});

it('passes missing session information to the SDK and displays its result on the host', () => {
  const fetch = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
  try {
    act(() => { tree = renderer.create(React.createElement(QA)); });
    const input = id => tree.root.findByProps({ testID: id }).props;
    setLiveConnection();
    act(() => input('qa-access-token').onChangeText('fixture-short-lived'));
    continueToMerchant();
    act(() => { input('qa-open-tokenization').onPress(); });
    expect(Alert.alert).not.toHaveBeenCalled();
    const { onResult, sessionRef } = tree.root.findByType('NgeniusTokenization').props;
    expect(sessionRef).toBe('');
    act(() => onResult({ statusCode: 400, message: 'Cannot initialize SDK.' }));
    expect(tree.root.findAllByType('NgeniusTokenization')).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Cannot initialize SDK.');
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

it('drives the offline session preview and closes after confirmed selection', async () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  act(() => byId('qa-preview').onValueChange(true));
  continueToMerchant();
  press('qa-open-tokenization');
  const screen = tree.root.findByType('NgeniusTokenization');
  expect(screen.props.sessionRef).toBe('preview-session');
  const { transport } = sdk.createTokenizationClient.mock.calls.find(([options]) => options.transport)[0];
  await expect(transport({ method: 'POST' })).rejects.toThrow('Unsupported preview operation');
  const list = await transport({ method: 'GET' });
  const session = JSON.parse(list.text);
  expect(session.advisedTokens[0]).toMatchObject({ tokenRef: 'preview-card', status: 'VERIFIED' });
  expect(session.paymentMethods).toEqual({ card: ['VISA', 'MASTERCARD'], wallet: ['APPLE_PAY', 'GOOGLE_PAY'] });
  expect(session.orderDetails).toMatchObject({ action: 'AUTH', amount: { currencyCode: 'AED', value: 1500 } });
  expect(session.orderDetails).not.toHaveProperty('paymentMethods');
  expect(session).not.toHaveProperty('tokens');
  expect(session).not.toHaveProperty('amount');
  expect(screen.props.order).toBeUndefined();
  expect(screen.props.paymentMethods).toBeUndefined();
  await expect(transport({ method: 'PUT' })).resolves.toEqual({ status: 204 });
  act(() => screen.props.onResult({ statusCode: 200, message: 'Payment method selected.', sessionID: 'preview-session' }));
  expect(tree.root.findAllByType('NgeniusTokenization')).toHaveLength(0);
});

it('sets presentation, branding and optional checkout return in the preview', () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  const toggle = accessibilityLabel => tree.root.findByProps({ accessibilityLabel }).props.onValueChange;
  act(() => {
    byId('qa-preview').onValueChange(true);
  });
  press('qa-appearance-options');
  act(() => {
    byId('qa-merchant-theme').onPress();
    toggle('Fullscreen')(true);
    toggle('Blur backdrop')(true);
    toggle('Pay by card first')(true);
    toggle('Continue Shopping')(true);
  });
  continueToMerchant();
  press('qa-open-tokenization');
  const screen = tree.root.findByType('NgeniusTokenization');
  expect(screen.props.branding).toMatchObject({ buttonColour: '#9C402A' });
  expect(screen.props.paymentMethods).toEqual(['CONTINUE_SHOPPING']);
  expect(screen.props.order).toBeUndefined();
  expect(screen.props.orderDetails).toBeUndefined();
  expect(screen.props.modeConfig).toMatchObject({
    presentation: 'fullscreen', backdropBlur: true, sectionOrder: ['card', 'tokens', 'wallets'],
  });
  act(() => screen.props.onResult({ statusCode: 402, message: 'Payment session expired.', sessionID: 'preview-session' }));
  expect(tree.root.findAllByType('NgeniusTokenization')).toHaveLength(1);
});

it('uses distinct fixtures for invalid initialization, expiry during selection, and a new shopper', async () => {
  const get = { method: 'GET' };
  const put = { method: 'PUT' };
  await expect(previewTransport('unauthorized')(get)).resolves.toEqual({ status: 401 });
  await expect(previewTransport('notFound')(get)).resolves.toEqual({ status: 404 });
  await expect(previewTransport('expired')(get)).resolves.toMatchObject({ status: 200 });
  await expect(previewTransport('expired')(put)).resolves.toEqual({ status: 401 });
  expect(JSON.parse((await previewTransport('new')(get)).text).advisedTokens).toEqual([]);
  expect(JSON.parse((await previewTransport('cardFormUnmasked')(get)).text))
    .toMatchObject({ advisedTokens: [], maskPaymentInfo: false });
  const legacy = JSON.parse((await previewTransport('legacySession')(get)).text);
  expect(legacy).toMatchObject({ amount: { currencyCode: 'AED', value: 100 }, paymentMethods: { card: ['VISA', 'MASTERCARD'] } });
  expect(legacy.tokens).toHaveLength(2);
  expect(legacy).not.toHaveProperty('orderDetails');
  expect(legacy).not.toHaveProperty('advisedTokens');
});


it('keeps the offline slow-selection preview pending until its acknowledgement, with the same session fixture', async () => {
  jest.useFakeTimers();
  try {
    const transport = previewTransport('slowSelection');
    const get = { method: 'GET' };
    const initial = JSON.parse((await transport(get)).text);
    expect(initial.orderDetails.amount).toEqual({ currencyCode: 'AED', value: 1500 });
    expect(initial.advisedTokens[0].tokenRef).toBe('preview-card');
    const acknowledged = jest.fn();
    const selection = transport({ method: 'PUT' }).then(acknowledged);
    jest.advanceTimersByTime(1999);
    await Promise.resolve();
    expect(acknowledged).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await selection;
    expect(acknowledged).toHaveBeenCalledTimes(1);
    expect(acknowledged).toHaveBeenCalledWith({ status: 204 });
    expect(JSON.parse((await transport(get)).text)).toEqual(initial);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});


it('separates empty runtime settings from the merchant screen and requires an explicit preview', () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  for (const id of ['qa-base-url', 'qa-outlet-ref', 'qa-access-token', 'qa-session-ref']) {
    expect(byId(id).value).toBe('');
  }
  expect(byId('qa-preview').value).toBe(false);
  expect(tree.root.findAllByProps({ testID: 'qa-open-tokenization' })).toHaveLength(0);
  expect(sdk.createTokenizationClient.mock.calls.every(([options]) => options.transport)).toBe(true);
  continueToMerchant();
  expect(Alert.alert).toHaveBeenCalledWith('Connection settings', expect.any(String));
  expect(tree.root.findAllByProps({ testID: 'qa-merchant-screen' })).toHaveLength(0);
  act(() => byId('qa-preview').onValueChange(true));
  continueToMerchant();
  expect(tree.root.findAllByProps({ testID: 'qa-settings-screen' })).toHaveLength(0);
  expect(tree.root.findAllByType('ScrollView')).toHaveLength(0);
  expect(tree.root.findAllByType('TextInput')).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Offline preview · synthetic data');
  expect(JSON.stringify(tree.toJSON())).not.toContain('15.00');
  press('qa-edit-settings');
  expect(byId('qa-preview').value).toBe(true);
});

it('boots the public demo entry without loading legacy gateway config or direct-payment APIs', () => {
  const { default: App } = require('../../../SimpleIntegration/src/app');
  act(() => { tree = renderer.create(React.createElement(App)); });
  expect(tree.root.findAllByProps({ testID: 'qa-settings-screen' })).toHaveLength(1);
  expect(tree.root.findAllByProps({ testID: 'qa-merchant-screen' })).toHaveLength(0);
  expect(tree.root.findAllByProps({ testID: 'qa-open-legacy' })).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Pay 1 AED');
  expect(byId('qa-base-url').value).toBe('');
  expect(byId('qa-outlet-ref').value).toBe('');
});
