jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator' }));
const React = require('react');
const renderer = require('react-test-renderer');
const View = require('../ui/SavedTokens').default;
it('renders an empty list and never displays full token references', () => {
  const render = value => renderer.create(React.createElement(View, { value, language: 'en', styles: {} }));
  let tree = render({ tokens: [], loading: false, failed: false });
  expect(tree.root.findByProps({ testID: 'saved-tokens-empty' })).toBeDefined();
  tree.unmount();
  tree = render({ tokens: [{ tokenRef: 'private-token-ref', type: 'CARD', cardDetails: { scheme: 'VISA', last4: '1234', expiry: '2030-12' } }] });
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain('1234');
  expect(text).not.toContain('private-token-ref');
  tree.unmount();
});
