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
const QA = require('../../../SimpleIntegration/src/tokenization-qa').default;
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; jest.clearAllMocks(); });
it('opens preview without a credential exchange or network and supports all demo languages', () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  act(() => tree.root.findByProps({ testID: 'qa-preview' }).props.onValueChange(true));
  for (const language of ['en', 'fr', 'ar']) {
    act(() => tree.root.findByProps({ testID: 'qa-open-tokenization' }).props.onPress());
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
  act(() => input('qa-open-tokenization').onPress());
  expect(Alert.alert).toHaveBeenCalledWith('Session reference required', expect.any(String));
  expect(tree.root.findAllByType('NgeniusTokenization')).toHaveLength(0);
  act(() => input('qa-session-ref').onChangeText(' merchant-session '));
  act(() => tree.root.findByProps({ testID: 'qa-open-tokenization' }).props.onPress());
  const provider = sdk.createTokenizationClient.mock.calls[0][0].getAccessToken;
  await expect(provider()).resolves.toBe('fixture-short-lived');
  const screen = tree.root.findByType('NgeniusTokenization');
  expect(screen.props.skipConsent).toBe(true);
  expect(screen.props.sessionRef).toBe('merchant-session');
  expect(input('qa-session-ref').value).toBe('');
  expect(screen.props.outletRef).toBe('a6b162e9-7a75-403c-b238-6303b2df455c');
  expect(JSON.stringify(screen.props)).not.toContain('fixture-short-lived');
  expect(tree.root.findByProps({ testID: 'qa-access-token' }).props.value).toBe('');
  act(() => screen.props.onCancel());
  await expect(provider()).rejects.toThrow('short-lived');
});

it('drives the offline session preview and closes after confirmed selection', async () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  act(() => tree.root.findByProps({ testID: 'qa-preview' }).props.onValueChange(true));
  act(() => tree.root.findByProps({ testID: 'qa-open-tokenization' }).props.onPress());
  const screen = tree.root.findByType('NgeniusTokenization');
  expect(screen.props.sessionRef).toBe('preview-session');
  const { transport } = sdk.createTokenizationClient.mock.calls[1][0];
  await expect(transport({ method: 'POST' })).rejects.toThrow('Unsupported preview operation');
  const list = await transport({ method: 'GET' });
  expect(JSON.parse(list.text).tokens[0]).toMatchObject({ tokenRef: 'preview-card', status: 'VERIFIED' });
  await expect(transport({ method: 'PUT' })).resolves.toEqual({ status: 204 });
  act(() => screen.props.onSelectionComplete({ sessionRef: 'preview-session' }));
  expect(tree.root.findAllByType('NgeniusTokenization')).toHaveLength(0);
});
