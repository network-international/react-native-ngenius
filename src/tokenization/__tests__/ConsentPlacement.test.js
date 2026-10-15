jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: jest.fn((current) => ({ current })),
  useState: jest.fn((value) => [value, jest.fn()]),
  useEffect: jest.fn(),
}));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image', Modal: 'Modal',
  SafeAreaView: 'SafeAreaView', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'android' }, StatusBar: { currentHeight: 24 },
  NativeModules: {},
  StyleSheet: { create: (styles) => styles },
  Linking: { canOpenURL: jest.fn().mockResolvedValue(true), openURL: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../nativePayments', () => ({
  initiateCardPayment: jest.fn().mockResolvedValue({ status: 'Success' }),
  initiateApplePay: jest.fn(), initiateGooglePay: jest.fn(),
  isApplePaySupported: jest.fn().mockResolvedValue(false),
  isGooglePaySupported: jest.fn().mockResolvedValue(false),
}));

const React = require('react');
const TokenizationScreen = require('../ui/TokenizationScreen').default;
const NgeniusTokenization = require('../NgeniusTokenization').default;
const { initiateCardPayment } = require('../../nativePayments');
const { resolveTokenizationTheme } = require('../resolveTheme');

const expand = (node) => {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (node == null || typeof node !== 'object') return node == null ? [] : [node];
  if (typeof node.type === 'function') return expand(node.type(node.props));
  if (node.type === React.Fragment) return expand(node.props.children);
  return [{ ...node, children: expand(node.props.children) }];
};
const flatten = (nodes) => nodes.flatMap((node) =>
  typeof node === 'object' ? [node, ...flatten(node.children)] : []);
const find = (nodes, id) => flatten(nodes).filter((node) => node.props.testID === id);
const ids = (nodes) => flatten(nodes).map((node) => node.props.testID).filter(Boolean);
const order = { action: 'VERIFY', paymentMethods: { card: ['VISA'] }, tncUrl: 'https://backend.example/terms?locale=ar' };
const { resolveConsentInformation } = require('../consentInformation');
const screen = (overrides = {}) => expand(React.createElement(TokenizationScreen, {
  consent: resolveConsentInformation({ order, ...overrides }),
  theme: resolveTokenizationTheme(), language: 'en', order,
  methods: ['CARD', 'APPLE_PAY'], status: 'READY', onSelectMethod: jest.fn(),
  ...overrides,
}));

describe('paypage consent placement and public props', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('renders wallet terms after wallet buttons and before the divider, then terms after card', () => {
    const tree = screen();
    const renderedIds = ids(tree);
    const positions = renderedIds.reduce((out, id, index) =>
      id === 'tokenization-consent-information' ? [...out, index] : out, []);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBeGreaterThan(renderedIds.indexOf('tokenization-method-APPLE_PAY'));
    expect(positions[0]).toBeLessThan(renderedIds.indexOf('tokenization-methods-divider'));
    expect(positions[1]).toBeGreaterThan(renderedIds.indexOf('tokenization-method-CARD'));
    expect(find(find(tree, 'tokenization-wallet-section'), 'tokenization-consent-information')).toHaveLength(1);
    expect(find(find(tree, 'tokenization-card-section'), 'tokenization-consent-information')).toHaveLength(1);
  });

  it.each([['CARD'], ['APPLE_PAY'], ['GOOGLE_PAY']])('places one block for %s alone', (method) => {
    const tree = screen({ methods: [method] });
    expect(find(tree, 'tokenization-consent-information')).toHaveLength(1);
    expect(find(tree, 'tokenization-methods-divider')).toHaveLength(0);
  });

  it('adds no wrapper or spacing when disabled', () => {
    const simplify = (nodes) => nodes.map((node) => typeof node !== 'object' ? node : ({
      type: node.type, id: node.props.testID,
      style: typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style,
      children: simplify(node.children),
    }));
    expect(simplify(screen({ consentOff: true })))
      .toEqual(simplify(screen()).map(function removeConsent(node) {
        if (!node || typeof node !== 'object') return node;
        return { ...node, children: node.children.filter((child) =>
          !child || child.id !== 'tokenization-consent-information').map(removeConsent) };
      }));
    expect(find(screen({ consentOff: true }), 'tokenization-consent-information')).toHaveLength(0);
  });

  it('keeps default consent visible without order details', () => {
    expect(find(screen({ order: undefined }), 'tokenization-consent-information')).toHaveLength(2);
  });

  it('renders no terms when no methods are present', () => {
    expect(find(screen({ methods: [] }), 'tokenization-consent-information')).toHaveLength(0);
  });

  it('keeps terms on retry and removes them from result screens', () => {
    expect(find(screen({ status: 'FAILED' }), 'tokenization-consent-information')).toHaveLength(2);
    expect(find(screen({ status: 'SUCCESS' }), 'tokenization-consent-information')).toHaveLength(0);
    expect(find(screen({ status: 'AWAITING_3DS' }), 'tokenization-consent-information')).toHaveLength(0);
  });

  it.each([undefined, false, true])('uses consentOff=%p and ignores public URL/content overrides', async (consentOff) => {
    const getTermsUrl = jest.fn(() => 'https://merchant.invalid/override');
    const tree = expand(React.createElement(NgeniusTokenization, {
      order, getTermsUrl, orderData: { tncUrl: 'https://merchant.invalid/override' },
      terms: { status: 'ready', url: 'https://merchant.invalid/override' }, tncUrl: 'https://merchant.invalid/override', consentOff, informationalText: { mode: 'custom', text: 'Injected' },
    }));
    expect(find(tree, 'tokenization-consent-information')).toHaveLength(consentOff === true ? 0 : 1);
    expect(JSON.stringify(tree)).not.toContain('Injected');
    const links = flatten(tree).filter((node) => node.props.accessibilityRole === 'link');
    expect(links).toHaveLength(0);
    for (const link of links) await link.props.onPress();
    expect(require('react-native').Linking.openURL).not.toHaveBeenCalled();
    expect(getTermsUrl).not.toHaveBeenCalled();
  });

  it.each([false, true])('leaves native CARD dispatch and success payload unchanged with consentOff=%p', async (consentOff) => {
    const onSuccess = jest.fn();
    const onError = jest.fn();
    const tree = expand(React.createElement(NgeniusTokenization, {
      visible: true, order, consentOff, onSuccess, onError,
    }));
    React.useEffect.mock.calls.forEach(([effect]) => effect());
    await find(tree, 'tokenization-method-CARD')[0].props.onPress();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(initiateCardPayment).toHaveBeenCalledTimes(1);
    expect(initiateCardPayment).toHaveBeenCalledWith(order);
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
      flow: 'TOKENIZATION', method: 'CARD', status: 'Success', niTokenCreated: false,
    }));
  });

  it('renders the backend tncUrl as the consent link', async () => {
    const { Linking } = require('react-native');
    const tncUrl = 'https://backend.example/terms?ref=two%2Fthree';
    const tree = screen({ consent: resolveConsentInformation({ order, tncUrl }) });
    const links = flatten(tree).filter((node) => node.props.accessibilityRole === 'link');
    expect(links).toHaveLength(2);
    await links[0].props.onPress();
    expect(Linking.openURL).toHaveBeenLastCalledWith(tncUrl);
  });

  describe('saved-tokens T&C loading', () => {
    const tncSetters = [];
    beforeEach(() => {
      tncSetters.length = 0;
      React.useState.mockImplementation((value) => {
        const setter = jest.fn();
        if (value && typeof value === 'object' && 'loaded' in value) tncSetters.push(setter);
        return [value, setter];
      });
    });
    afterEach(() => React.useState.mockImplementation((value) => [value, jest.fn()]));

    const open = async (props) => {
      React.useEffect.mockClear();
      expand(React.createElement(NgeniusTokenization, { visible: true, order, ...props }));
      React.useEffect.mock.calls.forEach(([effect]) => effect());
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    };

    it('requests saved tokens for the outlet once per open and applies tncUrl', async () => {
      const client = { getSavedTokens: jest.fn().mockResolvedValue({ tokens: [], tncUrl: 'https://backend.example/t' }) };
      await open({ tokenizationClient: client, outletRef: 'outlet-1' });
      expect(client.getSavedTokens).toHaveBeenCalledTimes(1);
      expect(client.getSavedTokens).toHaveBeenCalledWith({ outletRef: 'outlet-1' });
      expect(tncSetters[0]).toHaveBeenCalledWith({ loaded: true, url: 'https://backend.example/t' });
    });

    it('does not request T&C when consent is off', async () => {
      const client = { getSavedTokens: jest.fn() };
      await open({ tokenizationClient: client, outletRef: 'outlet-1', consentOff: true });
      expect(client.getSavedTokens).not.toHaveBeenCalled();
      expect(tncSetters[0]).toHaveBeenCalledWith({ loaded: true, url: undefined });
    });

    it('keeps consent without a link when loading fails', async () => {
      const client = { getSavedTokens: jest.fn().mockRejectedValue(new Error('offline')) };
      await open({ tokenizationClient: client, outletRef: 'outlet-1' });
      expect(tncSetters[0]).toHaveBeenCalledWith({ loaded: true, url: undefined });
    });

    it('resets the URL when the modal closes so a new open loads fresh', async () => {
      const client = { getSavedTokens: jest.fn() };
      await open({ tokenizationClient: client, outletRef: 'outlet-1', visible: false });
      expect(client.getSavedTokens).not.toHaveBeenCalled();
      expect(tncSetters[0]).toHaveBeenCalledWith({ loaded: false, url: undefined });
    });
  });

  it.each([
    [undefined, undefined, 'TERMS_URL_MISSING'],
    [{ tncUrl: 'javascript:private-payload' }, false, 'TERMS_URL_MISSING'],
    [order, false, 'TERMS_URL_MISSING'],
    [undefined, true, undefined],
  ])('emits only internal diagnostic codes for order=%p / consentOff=%p', (value, consentOff, code) => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    React.useState.mockImplementation((initial) => [
      initial && typeof initial === 'object' && 'loaded' in initial ? { loaded: true, url: undefined } : initial,
      jest.fn(),
    ]);
    try {
      const tree = expand(React.createElement(NgeniusTokenization, { visible: true, order: value, consentOff }));
      React.useEffect.mock.calls.forEach(([effect]) => effect());
      if (code) expect(info).toHaveBeenCalledWith('[TOKENIZATION_CONSENT]', { code });
      else expect(info).not.toHaveBeenCalled();
      const displayedText = flatten(tree).filter((node) => node.type === 'Text').map((node) => node.children);
      expect(JSON.stringify(displayedText)).not.toMatch(/TERMS_URL_|private-payload/);
      expect(JSON.stringify(info.mock.calls)).not.toContain('private-payload');
    } finally {
      info.mockRestore();
      React.useState.mockImplementation((value) => [value, jest.fn()]);
    }
  });

  it('emits no diagnostic before the T&C request settles', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      expand(React.createElement(NgeniusTokenization, { visible: true, order }));
      React.useEffect.mock.calls.forEach(([effect]) => effect());
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });
});
