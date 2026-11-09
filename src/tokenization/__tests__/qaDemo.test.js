jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', Switch: 'Switch', TouchableOpacity: 'TouchableOpacity', Alert: { alert: jest.fn() } }));
jest.mock('@network-international/react-native-ngenius', () => ({
  NgeniusTokenization: 'NgeniusTokenization',
  UsageType: { PERMANENT: 'PERMANENT' },
  createTokenizationClient: jest.fn(() => ({})),
}), { virtual: true });
const React = require('react');
const renderer = require('react-test-renderer');
const { act } = renderer;
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
    expect(screen.props.skipConsent).toBe(true);
    act(() => screen.props.onCancel());
    act(() => tree.root.findByProps({ testID: 'qa-language' }).props.onPress());
  }
});
it('keeps the runtime token out of props/storage and clears its provider on close', async () => {
  act(() => { tree = renderer.create(React.createElement(QA)); });
  expect(tree.root.findByProps({ testID: 'qa-access-token' }).props.secureTextEntry).toBe(true);
  act(() => tree.root.findByProps({ testID: 'qa-access-token' }).props.onChangeText('fixture-short-lived'));
  act(() => tree.root.findByProps({ testID: 'qa-open-tokenization' }).props.onPress());
  const provider = sdk.createTokenizationClient.mock.calls[0][0].getAccessToken;
  await expect(provider()).resolves.toBe('fixture-short-lived');
  const screen = tree.root.findByType('NgeniusTokenization');
  expect(screen.props.skipConsent).toBe(true);
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
  expect(screen.props.getUsageType({ method: 'CARD' })).toBe('PERMANENT');
  const { transport } = sdk.createTokenizationClient.mock.calls[1][0];
  const create = await transport({ method: 'POST' });
  const list = await transport({ method: 'GET' });
  expect(JSON.parse(create.text)).toEqual({ sessionRef: 'preview-session' });
  expect(JSON.parse(list.text).tokens[0]).toMatchObject({ tokenRef: 'preview-card', status: 'VERIFIED' });
  await expect(transport({ method: 'PUT' })).resolves.toEqual({ status: 204 });
  act(() => screen.props.onSelectionComplete({ sessionRef: 'preview-session' }));
  expect(tree.root.findAllByType('NgeniusTokenization')).toHaveLength(0);
});
