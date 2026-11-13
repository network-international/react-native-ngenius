jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  requireNativeComponent: jest.fn((name) => name),
}));

const React = require('react');
const renderer = require('react-test-renderer');
const { Platform } = require('react-native');
const NativeWalletButton = require('../NativeWalletButton').default;

const render = (props) => renderer.create(React.createElement(NativeWalletButton, props));

afterEach(() => { Platform.OS = 'ios'; });

it.each([
  ['ios', 'APPLE_PAY', true],
  ['ios', 'GOOGLE_PAY', false],
  ['android', 'GOOGLE_PAY', true],
  ['android', 'APPLE_PAY', false],
  ['web', 'APPLE_PAY', false],
])('renders %s/%s only on its native platform', (platform, method, visible) => {
  Platform.OS = platform;
  const tree = render({ method });
  expect(tree.toJSON() !== null).toBe(visible);
  tree.unmount();
});

it('does not forward a native press while consent or another owning guard disables the button', () => {
  const onPress = jest.fn();
  const tree = render({ method: 'APPLE_PAY', disabled: true, onPress });
  const button = tree.root.findByType('NIWalletButton');
  expect(button.props.disabled).toBe(true);
  expect(button.props.accessibilityState).toEqual({ disabled: true });
  button.props.onPress();
  expect(onPress).not.toHaveBeenCalled();
  tree.unmount();
});

it('returns an enabled native press to the existing selection callback', () => {
  Platform.OS = 'android';
  const onPress = jest.fn();
  const tree = render({ method: 'GOOGLE_PAY', disabled: false, onPress, testID: 'wallet' });
  const button = tree.root.findByType('NIWalletButton');
  expect(button.props.accessibilityLabel).toBe('Google Pay');
  expect(button.props.disabled).toBe(false);
  button.props.onPress();
  expect(onPress).toHaveBeenCalledTimes(1);
  tree.unmount();
});
