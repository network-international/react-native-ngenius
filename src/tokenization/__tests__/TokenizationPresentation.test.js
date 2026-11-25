jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable',
  StyleSheet: { create: styles => styles },
  Dimensions: { get: () => ({ height: 840 }) },
  Platform: { OS: 'android' },
  Easing: { out: jest.fn(), cubic: jest.fn() },
  AccessibilityInfo: { isReduceMotionEnabled: jest.fn().mockResolvedValue(true) },
  Animated: {
    View: 'AnimatedView',
    Value: function Value() { this.setValue = jest.fn(); this.interpolate = jest.fn(); this.stopAnimation = jest.fn(); },
    timing: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    spring: jest.fn(() => ({ start: jest.fn() })),
  },
  PanResponder: { create: config => ({ panHandlers: config }) },
  UIManager: { getViewManagerConfig: jest.fn() },
  requireNativeComponent: jest.fn(() => 'NativeBackdrop'),
}));

const React = require('react');
const { AccessibilityInfo, Animated, UIManager } = require('react-native');
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

it('claims drags on the handle before child controls can consume them', async () => {
  const onCancel = await render();
  const handle = byId('tokenization-sheet-handle')[0].props;
  expect(handle.onStartShouldSetPanResponder()).toBe(true);
  expect(handle.onStartShouldSetPanResponderCapture()).toBe(true);
  expect(handle.onPanResponderTerminationRequest()).toBe(false);
  act(() => handle.onPanResponderGrant());
  act(() => handle.onPanResponderMove(null, { dy: 100 }));
  act(() => handle.onPanResponderRelease(null, { dy: 100, vy: 0.2 }));
  expect(onCancel).toHaveBeenCalledWith('swipe');
});

it('does not claim the handle during an in-flight operation', async () => {
  await render({ dismissDisabled: true });
  const handle = byId('tokenization-sheet-handle')[0].props;
  expect(handle.onStartShouldSetPanResponder()).toBe(false);
  expect(handle.onStartShouldSetPanResponderCapture()).toBe(false);
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

it('keeps the backdrop and restores the same Android sheet after the native form closes', async () => {
  await render({ covered: true });
  const panel = byId('tokenization-sheet-panel')[0];
  const presentation = tree.root.findByType(TokenizationPresentation);
  expect(panel.props.style).toContainEqual({ opacity: 0 });
  expect(byId('tokenization-backdrop')).toHaveLength(1);
  act(() => tree.update(React.createElement(TokenizationPresentation, { ...presentation.props, covered: false })));
  expect(byId('tokenization-sheet-panel')[0]).toBe(panel);
  expect(panel.props.style).not.toContainEqual({ opacity: 0 });
});

it('waits for the native modal to become visible before running the entrance animation', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockResolvedValueOnce(false);
  const start = jest.fn();
  Animated.timing.mockReturnValueOnce({ start, stop: jest.fn() });
  await render({ shown: false });
  expect(start).not.toHaveBeenCalled();
  const presentation = tree.root.findByType(TokenizationPresentation);
  act(() => tree.update(React.createElement(TokenizationPresentation, { ...presentation.props, shown: true })));
  expect(start).toHaveBeenCalledTimes(1);
});
