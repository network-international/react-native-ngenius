jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', Switch: 'Switch', TouchableOpacity: 'TouchableOpacity', Alert: { alert: jest.fn() } }));
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
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; jest.clearAllMocks(); });
it('opens preview without a credential exchange or network and supports all demo languages', () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  act(() => tree.root.findByProps({ testID: 'qa-preview' }).props.onValueChange(true));
  for (const language of ['en', 'fr', 'ar']) {
    act(() => { tree.root.findByProps({ testID: 'qa-open-tokenization' }).props.onPress(); });
    const screen = tree.root.findByType('NgeniusTokenization');
    expect(screen.props.language).toBe(language);
    expect(screen.props.sessionRef).toBe('preview-session');
    expect(screen.props.skipConsent).toBe(true);
    act(() => screen.props.onCancel());
    act(() => tree.root.findByProps({ testID: 'qa-language' }).props.onPress());
  }
});
it('keeps the runtime token out of props/storage and clears its provider on close', async () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  expect(tree.root.findByProps({ testID: 'qa-access-token' }).props.secureTextEntry).toBe(true);
  const input = id => tree.root.findByProps({ testID: id }).props;
  act(() => input('qa-access-token').onChangeText('fixture-short-lived'));
  act(() => input('qa-session-ref').onChangeText('invalid reference'));
  act(() => { input('qa-open-tokenization').onPress(); });
  expect(Alert.alert).toHaveBeenCalledWith('Invalid session reference', expect.any(String));
  expect(tree.root.findAllByType('NgeniusTokenization')).toHaveLength(0);
  act(() => input('qa-session-ref').onChangeText(' merchant-session '));
  act(() => { tree.root.findByProps({ testID: 'qa-open-tokenization' }).props.onPress(); });
  const provider = sdk.createTokenizationClient.mock.calls[0][0].getAccessToken;
  await expect(provider()).resolves.toBe('fixture-short-lived');
  const screen = tree.root.findByType('NgeniusTokenization');
  expect(screen.props.skipConsent).toBe(true);
  expect(screen.props.sessionRef).toBe('merchant-session');
  expect(screen.props.modeConfig.tokenType).toBe('ONCE_OFF');
  expect(input('qa-session-ref').value).toBe('');
  expect(screen.props.outletRef).toBe('a6b162e9-7a75-403c-b238-6303b2df455c');
  expect(JSON.stringify(screen.props)).not.toContain('fixture-short-lived');
  expect(tree.root.findByProps({ testID: 'qa-access-token' }).props.value).toBe('');
  act(() => screen.props.onCancel());
  await expect(provider()).rejects.toThrow('short-lived');
});

it('creates one real sandbox session from the QA screen before handing the reference to SDK', async () => {
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true, json: async () => ({ sessionRef: 'sandbox-session-fixture' }),
  });
  try {
    act(() => { tree = renderer.create(React.createElement(QA)); });
    const input = id => tree.root.findByProps({ testID: id }).props;
    act(() => input('qa-access-token').onChangeText('Bearer fixture-short-lived'));
    await act(async () => {
      const open = input('qa-open-tokenization').onPress;
      await Promise.all([open(), open()]);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://paypage-sandbox.platform.network.ae/api/outlets/a6b162e9-7a75-403c-b238-6303b2df455c/payment-tokenization-sessions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Access-Token': 'fixture-short-lived', 'Content-Type': 'application/json' },
        body: '{"advisedTokens":[]}',
      }),
    );
    const screen = tree.root.findByType('NgeniusTokenization');
    expect(screen.props.sessionRef).toBe('sandbox-session-fixture');
    expect(input('qa-access-token').value).toBe('');
  } finally {
    fetch.mockRestore();
  }
});

it('drives the offline session preview and closes after confirmed selection', async () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  act(() => tree.root.findByProps({ testID: 'qa-preview' }).props.onValueChange(true));
  act(() => { tree.root.findByProps({ testID: 'qa-open-tokenization' }).props.onPress(); });
  const screen = tree.root.findByType('NgeniusTokenization');
  expect(screen.props.sessionRef).toBe('preview-session');
  const { transport } = sdk.createTokenizationClient.mock.calls[1][0];
  await expect(transport({ method: 'POST' })).rejects.toThrow('Unsupported preview operation');
  const list = await transport({ method: 'GET' });
  expect(JSON.parse(list.text).tokens[0]).toMatchObject({ tokenRef: 'preview-card', status: 'VERIFIED' });
  await expect(transport({ method: 'PUT' })).resolves.toEqual({ status: 204 });
  act(() => screen.props.onResult({ statusCode: 200, message: 'Payment method selected.', sessionID: 'preview-session' }));
  expect(tree.root.findAllByType('NgeniusTokenization')).toHaveLength(0);
});

it('sets presentation, branding and optional checkout return in the preview', () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  const byId = testID => tree.root.findByProps({ testID }).props;
  const toggle = accessibilityLabel => tree.root.findByProps({ accessibilityLabel }).props.onValueChange;
  act(() => {
    byId('qa-preview').onValueChange(true);
    byId('qa-merchant-theme').onPress();
    toggle('Fullscreen')(true);
    toggle('Blur backdrop')(true);
    toggle('Pay by card first')(true);
    toggle('Continue Shopping')(true);
  });
  act(() => { byId('qa-open-tokenization').onPress(); });
  const screen = tree.root.findByType('NgeniusTokenization');
  expect(screen.props.branding).toMatchObject({ buttonColour: '#9C402A' });
  expect(screen.props.paymentMethods).toEqual(['CARD', 'CONTINUE_SHOPPING']);
  expect(screen.props.modeConfig).toMatchObject({
    presentation: 'fullscreen', backdropBlur: true, sectionOrder: ['card', 'tokens', 'wallets'],
  });
  act(() => screen.props.onResult({ statusCode: 402, message: 'Payment session expired.' }));
  expect(tree.root.findAllByType('NgeniusTokenization')).toHaveLength(1);
});

it('uses distinct fixtures for invalid initialization, expiry during selection, and a new shopper', async () => {
  const get = { method: 'GET' };
  const put = { method: 'PUT' };
  await expect(previewTransport('unauthorized')(get)).resolves.toEqual({ status: 401 });
  await expect(previewTransport('notFound')(get)).resolves.toEqual({ status: 404 });
  await expect(previewTransport('expired')(get)).resolves.toMatchObject({ status: 200 });
  await expect(previewTransport('expired')(put)).resolves.toEqual({ status: 401 });
  expect(JSON.parse((await previewTransport('new')(get)).text).tokens).toEqual([]);
});
