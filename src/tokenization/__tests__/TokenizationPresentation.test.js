jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable',
  StyleSheet: { create: styles => styles },
  Dimensions: { get: () => ({ height: 840 }) },
  AccessibilityInfo: { isReduceMotionEnabled: jest.fn().mockResolvedValue(true) },
  Animated: {
    View: 'AnimatedView',
    Value: function Value() { this.setValue = jest.fn(); },
    timing: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    spring: jest.fn(() => ({ start: jest.fn() })),
  },
  PanResponder: { create: config => ({ panHandlers: config }) },
  UIManager: { getViewManagerConfig: jest.fn() },
  requireNativeComponent: jest.fn(() => 'NativeBackdrop'),
}));

const React = require('react');
const { UIManager } = require('react-native');
const { create, act } = require('react-test-renderer');
const TokenizationPresentation = require('../ui/TokenizationPresentation').default;
const { resolveTokenizationTheme } = require('../resolveTheme');

let tree;
const render = async (options = {}) => {
  const onCancel = jest.fn();
  await act(async () => {
    tree = create(React.createElement(TokenizationPresentation, {
      theme: resolveTokenizationTheme(), language: 'en', onCancel, ...options,
    }, React.createElement('Chooser')));
  });
  return onCancel;
};
const byId = id => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id);
afterEach(() => { if (tree) act(() => tree.unmount()); tree = undefined; });

it('dismisses a sheet by a backdrop tap or deliberate swipe, preserving the source', async () => {
  const onCancel = await render();
  const sheet = byId('tokenization-sheet-panel')[0].props;
  expect(sheet.onMoveShouldSetPanResponder(null, { dx: 3, dy: 20 })).toBe(true);
  expect(sheet.onMoveShouldSetPanResponder(null, { dx: 40, dy: 20 })).toBe(false);
  act(() => sheet.onPanResponderRelease(null, { dy: 22, vy: 0.2 }));
  expect(onCancel).not.toHaveBeenCalled();
  act(() => sheet.onPanResponderRelease(null, { dy: 90, vy: 0.2 }));
  act(() => byId('tokenization-backdrop')[0].props.onPress());
  expect(onCancel.mock.calls).toEqual([['swipe'], ['backdrop']]);
});

it('does not dismiss during an in-flight operation', async () => {
  const onCancel = await render({ dismissDisabled: true });
  const sheet = byId('tokenization-sheet-panel')[0].props;
  expect(sheet.onMoveShouldSetPanResponder(null, { dx: 0, dy: 60 })).toBe(false);
  act(() => sheet.onPanResponderRelease(null, { dy: 120, vy: 1 }));
  act(() => byId('tokenization-backdrop')[0].props.onPress());
  expect(onCancel).not.toHaveBeenCalled();
});

it('provides a safe dimmed fallback if blur is unavailable, and uses the registered blur if available', async () => {
  UIManager.getViewManagerConfig.mockReturnValueOnce(undefined);
  await render({ modeConfig: { backdropBlur: true } });
  expect(tree.root.findAllByType('NativeBackdrop')).toHaveLength(0);
  expect(byId('tokenization-backdrop')).toHaveLength(1);
  act(() => tree.unmount());
  UIManager.getViewManagerConfig.mockReturnValueOnce({});
  await render({ modeConfig: { backdropBlur: true } });
  expect(tree.root.findAllByType('NativeBackdrop')).toHaveLength(1);
});

it('renders fullscreen directly without sheet controls or blur', async () => {
  await render({ modeConfig: { presentation: 'fullscreen', backdropBlur: true } });
  expect(tree.root.findAllByType('Chooser')).toHaveLength(1);
  expect(byId('tokenization-backdrop')).toHaveLength(0);
});
