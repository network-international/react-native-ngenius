jest.mock('react-native', () => ({
  Modal: 'Modal', Platform: { OS: 'android', Version: 35 },
  Dimensions: { get: () => ({ width: 412, height: 915 }) },
}));
jest.mock('../ui/TokenizationScreen', () => 'TokenizationScreen');
jest.mock('../nativeWallets', () => ({ captureApplePayToken: jest.fn() }));
jest.mock('../nativeCards', () => ({ startNativeCardTokenization: jest.fn() }));
jest.mock('../../nativePayments', () => ({
  initiateCardPayment: jest.fn(), initiateApplePay: jest.fn(), initiateGooglePay: jest.fn(),
  isApplePaySupported: jest.fn(), isGooglePaySupported: jest.fn(),
}));
jest.mock('../session', () => {
  const actual = jest.requireActual('../session');
  return { ...actual, createTokenizationSession: jest.fn(() => {
    const session = actual.createTokenizationSession();
    jest.spyOn(session, 'setAccepted');
    return session;
  }) };
});

const React = require('react');
const renderer = require('react-test-renderer');
const { act } = renderer;
const { Platform } = require('react-native');
const Component = require('../NgeniusTokenization').default;
const { startNativeCardTokenization } = require('../nativeCards');
const { createTokenizationSession } = require('../session');
const native = require('../../nativePayments');
const { captureApplePayToken } = require('../nativeWallets');
const { UsageType } = require('../usageType');
const order = { action: 'VERIFY', paymentMethods: { card: ['VISA'], wallet: ['GOOGLE_PAY', 'APPLE_PAY'] } };
const card = { tokenRef: '8a880dc0-d2d2-4067-bcb1-b08d1690b26e', type: 'CARD', status: 'VERIFIED', cardDetails: { scheme: 'VISA', last4: '1234', expiry: '2031-07' } };
const wallet = walletType => ({ ...card, tokenRef: 'new-wallet-token', type: 'WALLET', walletType });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { resolve, promise }; };
const flush = async () => { for (let i = 0; i < 15; i += 1) await Promise.resolve(); };
let tree, props;
const screen = () => tree.root.findByType('TokenizationScreen').props;
const modal = () => tree.root.findByType('Modal').props;
const session = () => createTokenizationSession.mock.results[createTokenizationSession.mock.results.length - 1].value;
const acceptedCalls = () => session().setAccepted.mock.calls.filter(call => call[0] === true);
const defaultClient = () => ({
  createSession: jest.fn(),
  getSession: jest.fn().mockResolvedValue({ tokens: [], tncUrl: 'https://backend.example/terms' }),
  supportsAddWallet: true,
  addWallet: jest.fn(async ({ walletType }) => ({ tokens: [wallet(walletType)] })),
  selectToken: jest.fn().mockResolvedValue({ status: 'SELECTED' }),
});
const open = async (extra = {}) => {
  props = {
    visible: true, order, paymentMethods: ['CARD', 'APPLE_PAY', 'GOOGLE_PAY'], outletRef: 'outlet', sessionRef: 'session-1',
    tokenizationClient: defaultClient(),
    onSuccess: jest.fn(), onError: jest.fn(), onCancel: jest.fn(), ...extra,
  };
  await act(async () => { tree = renderer.create(React.createElement(Component, props)); await flush(); });
};
const update = async extra => {
  props = { ...props, ...extra };
  await act(async () => { tree.update(React.createElement(Component, props)); await flush(); });
};
const select = async method => {
  await act(async () => { screen().onSelectMethod(method); await flush(); });
};
const dismissRnModal = async () => {
  await act(async () => { modal().onDismiss(); await flush(); });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-06T08:00:00.000Z'));
  jest.clearAllMocks();
  Platform.OS = 'android';
  startNativeCardTokenization.mockReset().mockImplementation(() => ({ promise: new Promise(() => {}), cancel: jest.fn() }));
  native.initiateGooglePay.mockReset().mockResolvedValue({ token: 'opaque-wallet' });
  native.isApplePaySupported.mockReset().mockResolvedValue(true);
  native.isGooglePaySupported.mockReset().mockResolvedValue(true);
  captureApplePayToken.mockReset().mockResolvedValue({ token: 'opaque-wallet' });
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
});

it.each([undefined, false, true])('loads consent context without collecting acceptance on open (skipConsent=%p)', async skipConsent => {
  await open({ skipConsent });
  expect(props.tokenizationClient.createSession).not.toHaveBeenCalled();
  expect(props.tokenizationClient.getSession).toHaveBeenCalledWith({
    outletRef: 'outlet', sessionRef: 'session-1', skipConsent: skipConsent === true,
  });
  expect(screen().consent).toEqual(skipConsent === true ? null : { key: undefined, url: 'https://backend.example/terms', diagnostic: undefined });
  expect(screen().consentAccepted).toBe(false);
  expect(screen().onConsentChange).toBeUndefined();
  expect(session().acceptanceTimestamp()).toBeUndefined();
  expect(acceptedCalls()).toHaveLength(0);
});

it('collects Card consent synchronously on the click, before React can commit acceptance state', async () => {
  let clickConsent;
  startNativeCardTokenization.mockImplementation(args => {
    clickConsent = args.getConsentData();
    return { promise: new Promise(() => {}), cancel: jest.fn() };
  });
  await open({ language: 'fr' });
  expect(screen().consentAccepted).toBe(false);
  jest.setSystemTime(new Date('2026-11-06T08:01:02.003Z'));
  const click = screen().onSelectMethod;
  await act(async () => { click('CARD'); click('CARD'); await flush(); });
  expect(startNativeCardTokenization).toHaveBeenCalledTimes(1);
  expect(acceptedCalls()).toHaveLength(1);
  expect(clickConsent).toMatchObject({
    status: 'COLLECTED', clientTimestamp: '2026-11-06T08:01:02.003Z',
    tncUrl: 'https://backend.example/terms', locale: 'fr', channel: 'REACT_NATIVE',
    sdk: { name: 'react-native-ngenius', version: require('../../version').SDK_VERSION },
    device: { platform: 'ANDROID', osVersion: '35', screenWidth: 412, screenHeight: 915 },
  });
  expect(clickConsent).not.toHaveProperty('skippedByMerchant');
  expect(screen().consentAccepted).toBe(true);
});

it.each([
  ['APPLE_PAY', undefined, UsageType.PERMANENT],
  ['GOOGLE_PAY', UsageType.ONCE_OFF, UsageType.ONCE_OFF],
])('records %s click time, uses the configured token type and blocks duplicates', async (method, tokenType, usageType) => {
  Platform.OS = method === 'APPLE_PAY' ? 'ios' : 'android';
  const capture = deferred();
  const fn = method === 'APPLE_PAY' ? captureApplePayToken : native.initiateGooglePay;
  fn.mockReturnValueOnce(capture.promise);
  await open({ modeConfig: { tokenType } });
  jest.setSystemTime(new Date('2026-11-06T08:02:00.000Z'));
  const click = screen().onSelectMethod;
  await act(async () => { click(method); click(method); await flush(); });
  expect(acceptedCalls()).toHaveLength(1);
  expect(session().acceptanceTimestamp()).toBe('2026-11-06T08:02:00.000Z');
  if (Platform.OS === 'ios') {
    expect(fn).not.toHaveBeenCalled();
    await dismissRnModal();
    await dismissRnModal();
  }
  expect(fn).toHaveBeenCalledTimes(1);
  jest.setSystemTime(new Date('2026-11-06T08:05:00.000Z'));
  await act(async () => { capture.resolve({ token: 'opaque-wallet' }); await flush(); });
  expect(props.tokenizationClient.addWallet).toHaveBeenCalledTimes(1);
  expect(props.tokenizationClient.addWallet).toHaveBeenCalledWith({
    outletRef: 'outlet', sessionRef: 'session-1', walletType: method,
    encryptedPayload: 'opaque-wallet', usageType,
    consentData: expect.objectContaining({ status: 'COLLECTED', clientTimestamp: '2026-11-06T08:02:00.000Z' }),
  });
  expect(screen().savedTokens.tokens).toEqual([wallet(method)]);
  expect(screen().tokenSaved).toBe(true);
  expect(screen().selectedTokenRef).toBeNull();
  expect(props.tokenizationClient.createSession).not.toHaveBeenCalled();
  expect(props.tokenizationClient.getSession).toHaveBeenCalledTimes(1);
  expect(props.tokenizationClient.selectToken).not.toHaveBeenCalled();
  expect(native.initiateCardPayment).not.toHaveBeenCalled();
  expect(native.initiateApplePay).not.toHaveBeenCalled();
});

it.each(['APPLE_PAY', 'GOOGLE_PAY'])('reports %s as backend-pending before recording consent or showing a sheet', async method => {
  Platform.OS = method === 'APPLE_PAY' ? 'ios' : 'android';
  const tokenizationClient = { ...defaultClient(), supportsAddWallet: false };
  await open({ tokenizationClient });
  expect(screen().methods).toContain(method);
  await select(method);
  expect(modal().visible).toBe(true);
  expect(acceptedCalls()).toHaveLength(0);
  expect(captureApplePayToken).not.toHaveBeenCalled();
  expect(native.initiateGooglePay).not.toHaveBeenCalled();
  expect(tokenizationClient.addWallet).not.toHaveBeenCalled();
  expect(props.onError).toHaveBeenCalledWith(expect.objectContaining({
    method, code: 'ADD_WALLET_BACKEND_PENDING',
  }));
});

it('keeps skipConsent NOT_COLLECTED with a request-time timestamp and no terms/locale', async () => {
  const capture = deferred();
  native.initiateGooglePay.mockReturnValueOnce(capture.promise);
  await open({ skipConsent: true, language: 'ar' });
  await select('GOOGLE_PAY');
  expect(acceptedCalls()).toHaveLength(0);
  expect(session().acceptanceTimestamp()).toBeUndefined();
  expect(screen().consentAccepted).toBe(false);
  jest.setSystemTime(new Date('2026-11-06T08:07:00.000Z'));
  await act(async () => { capture.resolve({ token: 'opaque-wallet' }); await flush(); });
  const data = props.tokenizationClient.addWallet.mock.calls[0][0].consentData;
  expect(data).toMatchObject({ status: 'NOT_COLLECTED', skippedByMerchant: true, clientTimestamp: '2026-11-06T08:07:00.000Z' });
  expect(data).not.toHaveProperty('tncUrl');
  expect(data).not.toHaveProperty('locale');
});

it.each([undefined, 'javascript:alert(1)'])('preserves the existing optional-URL contract without inventing terms (%p)', async tncUrl => {
  await open({ tokenizationClient: {
    ...defaultClient(),
    getSession: jest.fn().mockResolvedValue({ tokens: [], tncUrl }),
  } });
  expect(screen().consent.url).toBeNull();
  expect(acceptedCalls()).toHaveLength(0);
  await select('GOOGLE_PAY');
  expect(props.tokenizationClient.addWallet).toHaveBeenCalledTimes(1);
  const data = props.tokenizationClient.addWallet.mock.calls[0][0].consentData;
  expect(data.status).toBe('COLLECTED');
  expect(data).not.toHaveProperty('tncUrl');
});

it('does not collect from list refresh, saved-row selection or confirming an existing token', async () => {
  await open();
  props.tokenizationClient.getSession.mockResolvedValue({ tokens: [card], tncUrl: 'https://backend.example/terms' });
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  act(() => screen().onSelectToken(card.tokenRef));
  expect(screen().consentAccepted).toBe(false);
  expect(acceptedCalls()).toHaveLength(0);
  await act(async () => { screen().onConfirmSavedToken(card.tokenRef); await flush(); });
  expect(props.tokenizationClient.selectToken).toHaveBeenCalledTimes(1);
  expect(acceptedCalls()).toHaveLength(0);
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
});

it('ignores loading, unavailable method and prior-launch click handlers without collecting consent', async () => {
  const first = deferred();
  await open({ tokenizationClient: {
    ...defaultClient(),
    getSession: jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ tokens: [] }),
  } });
  await select('CARD');
  expect(acceptedCalls()).toHaveLength(0);
  await act(async () => { first.resolve({ tokens: [], tncUrl: 'https://backend.example/terms' }); await flush(); });
  await select('APPLE_PAY'); // Unsupported on the current Android platform.
  await select('UNKNOWN');
  expect(acceptedCalls()).toHaveLength(0);
  const previousClick = screen().onSelectMethod;
  await update({ visible: false });
  await update({ visible: true });
  await act(async () => { previousClick('CARD'); await flush(); });
  expect(acceptedCalls()).toHaveLength(0);
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
});

it('rejects stale consent-mode and terms-context handlers before recording acceptance', async () => {
  await open({ skipConsent: true });
  const skippedClick = screen().onSelectMethod;
  await update({ skipConsent: false });
  await act(async () => { skippedClick('CARD'); await flush(); });
  expect(acceptedCalls()).toHaveLength(0);
  const oldTermsClick = screen().onSelectMethod;
  props.tokenizationClient.getSession.mockResolvedValue({ tokens: [], tncUrl: 'https://new.example/terms' });
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  await act(async () => { oldTermsClick('CARD'); await flush(); });
  expect(acceptedCalls()).toHaveLength(0);
  await select('CARD');
  expect(acceptedCalls()).toHaveLength(1);
  expect(startNativeCardTokenization.mock.calls[0][0].getConsentData().tncUrl).toBe('https://new.example/terms');
});

it.each(['Aborted', 'Failed'])('records a fresh click timestamp after a wallet %s retry', async status => {
  native.initiateGooglePay.mockRejectedValueOnce({ status });
  await open();
  await select('GOOGLE_PAY');
  expect(props.tokenizationClient.addWallet).not.toHaveBeenCalled();
  if (status === 'Aborted') {
    expect(session().acceptanceTimestamp()).toBeUndefined();
    expect(screen().consentAccepted).toBe(false);
  }
  jest.setSystemTime(new Date('2026-11-06T08:11:12.013Z'));
  await select('GOOGLE_PAY');
  expect(acceptedCalls()).toHaveLength(2);
  expect(props.tokenizationClient.addWallet.mock.calls[0][0].consentData.clientTimestamp).toBe('2026-11-06T08:11:12.013Z');
});

it('clears Card acceptance on Back and captures a new timestamp on the next Card click', async () => {
  const back = deferred();
  startNativeCardTokenization.mockReturnValueOnce({ promise: back.promise, cancel: jest.fn() });
  await open();
  await select('CARD');
  expect(acceptedCalls()).toHaveLength(1);
  await act(async () => { back.resolve({ state: 'READY' }); await flush(); });
  expect(session().acceptanceTimestamp()).toBeUndefined();
  expect(screen().consentAccepted).toBe(false);
  jest.setSystemTime(new Date('2026-11-06T08:12:00.000Z'));
  await select('CARD');
  expect(startNativeCardTokenization.mock.calls[1][0].getConsentData().clientTimestamp).toBe('2026-11-06T08:12:00.000Z');
});

it.each(['close', 'outlet', 'session', 'unmount'])('invalidates acceptance and outstanding wallet work on %s', async boundary => {
  const capture = deferred();
  native.initiateGooglePay.mockReturnValueOnce(capture.promise);
  await open();
  await select('GOOGLE_PAY');
  if (boundary === 'unmount') { act(() => tree.unmount()); tree = undefined; }
  else if (boundary === 'close') { await update({ visible: false }); await update({ visible: true }); }
  else if (boundary === 'outlet') await update({ outletRef: 'outlet-2' });
  else await update({ sessionRef: 'session-2' });
  expect(session().acceptanceTimestamp()).toBeUndefined();
  await act(async () => { capture.resolve({ token: 'opaque-wallet' }); await flush(); });
  expect(props.tokenizationClient.addWallet).not.toHaveBeenCalled();
  expect(props.onSuccess).not.toHaveBeenCalled();
  expect(props.onError).not.toHaveBeenCalled();
  if (tree) expect(screen().consentAccepted).toBe(false);
});

it('does not collect on cancel and rejects a cancelled-session click', async () => {
  await open();
  const oldClick = screen().onSelectMethod;
  act(() => screen().onCancel());
  await act(async () => { oldClick('CARD'); await flush(); });
  expect(props.onCancel).toHaveBeenCalledTimes(1);
  expect(acceptedCalls()).toHaveLength(0);
  expect(session().acceptanceTimestamp()).toBeUndefined();
});

it('does not start deferred iOS Card presentation after the session closes', async () => {
  Platform.OS = 'ios';
  await open();
  await select('CARD');
  const dismiss = modal().onDismiss;
  await update({ visible: false });
  await act(async () => { dismiss(); jest.advanceTimersByTime(1000); await flush(); });
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
  expect(session().acceptanceTimestamp()).toBeUndefined();
});

it('uses raw orderDetails for the native context and a separate normalized order summary', async () => {
  const details = { language: 'ar', amount: { currencyCode: 'AED', value: '3910' }, paymentMethods: { card: [], wallet: ['GOOGLE_PAY'] } };
  await open({ orderDetails: details, order: { language: 'fr', amount: { currencyCode: 'USD', value: 100 } }, paymentMethods: undefined });
  expect(screen().language).toBe('ar');
  expect(screen().orderSummary.amount).toMatchObject({ currencyCode: 'AED', value: '3910', formattedValue: '39.10' });
  expect(screen().methods).toEqual(['GOOGLE_PAY']);
  await select('GOOGLE_PAY');
  expect(native.initiateGooglePay).toHaveBeenCalledWith({ ...details, amount: { ...details.amount, value: 0, formattedValue: '0.00' } }, undefined);
  expect(details.amount.value).toBe('3910');
});

it.each(['outlet', 'reopen'])('keeps explicit orderDetails presentation and wallet capture on the same snapshot until %s', async boundary => {
  const first = { language: 'en', amount: { currencyCode: 'AED', value: '100' } };
  const next = { language: 'en', amount: { currencyCode: 'USD', value: '250' } };
  await open({ orderDetails: first });
  await update({ orderDetails: next, language: 'fr' });
  expect(screen().language).toBe('fr');
  expect(screen().orderSummary.amount).toMatchObject({ currencyCode: 'AED', formattedValue: '1.00', text: 'AED 1,00' });
  await select('GOOGLE_PAY');
  expect(native.initiateGooglePay).toHaveBeenLastCalledWith({
    ...first, amount: { ...first.amount, value: 0, formattedValue: '0.00' },
  }, undefined);

  if (boundary === 'reopen') {
    await update({ visible: false });
    await update({ visible: true });
  } else await update({ outletRef: 'outlet-2' });
  expect(screen().orderSummary.amount).toMatchObject({ currencyCode: 'USD', formattedValue: '2.50', text: 'USD 2,50' });
  await select('GOOGLE_PAY');
  expect(native.initiateGooglePay).toHaveBeenLastCalledWith({
    ...next, amount: { ...next.amount, value: 0, formattedValue: '0.00' },
  }, undefined);
});

it.each(['outlet', 'reopen'])('keeps saving terms on the active order snapshot until %s while refreshing backend links', async boundary => {
  const first = { amount: { currencyCode: 'AED', value: '3910' } };
  const recurring = { ...first, type: 'RECURRING', merchantAttributes: { paymentModel: 'subscription' } };
  await open({ orderDetails: first });
  expect(screen().consent.key).toBeUndefined();
  await update({ orderDetails: recurring, language: 'ar' });
  expect(screen().language).toBe('ar');
  expect(screen().consent.key).toBeUndefined();
  props.tokenizationClient.getSession.mockResolvedValue({ tokens: [], tncUrl: 'https://new.example/terms' });
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  expect(screen().consent).toMatchObject({ key: undefined, url: 'https://new.example/terms' });

  if (boundary === 'reopen') {
    await update({ visible: false });
    await update({ visible: true });
  } else await update({ outletRef: 'outlet-2' });
  expect(screen().consent).toMatchObject({ key: 'SUBSCRIPTION_TERMS_AND_CONDITIONS', url: 'https://new.example/terms' });
  expect(screen().language).toBe('ar');
  await select('CARD');
  expect(startNativeCardTokenization.mock.calls[0][0].getConsentData()).toMatchObject({
    status: 'COLLECTED', locale: 'ar', tncUrl: 'https://new.example/terms',
  });
});

it.each(['invalid', [], 42])('does not use a hidden legacy wallet order when explicit orderDetails is invalid (%p)', async orderDetails => {
  await open({ orderDetails, order: { amount: { currencyCode: 'AED', value: '3910' } } });
  expect(screen().orderSummary).toBeNull();
  await select('GOOGLE_PAY');
  expect(native.initiateGooglePay).not.toHaveBeenCalled();
  expect(props.tokenizationClient.addWallet).not.toHaveBeenCalled();
  expect(acceptedCalls()).toHaveLength(0);
  expect(props.onError).toHaveBeenCalledWith(expect.objectContaining({ error: 'Order not found' }));
});

it.each([undefined, null])('keeps the legacy order alias when orderDetails is absent (%p)', async orderDetails => {
  const legacy = { amount: { currencyCode: 'AED', value: '3910' } };
  await open({ orderDetails, order: legacy });
  expect(screen().orderSummary.amount).toMatchObject({ currencyCode: 'AED', formattedValue: '39.10' });
  await select('GOOGLE_PAY');
  expect(native.initiateGooglePay).toHaveBeenCalledWith({
    ...legacy, amount: { ...legacy.amount, value: 0, formattedValue: '0.00' },
  }, undefined);
});

it.each([
  [{ language: 'fr', orderDetails: { language: 'ar' }, order: { language: 'en' } }, 'fr'],
  [{ orderDetails: { language: 'ar' }, order: { language: 'fr' } }, 'ar'],
  [{ orderDetails: {}, order: { language: 'fr' } }, 'fr'],
  [{ order: undefined }, 'en'],
])('resolves explicit, details, legacy and fallback language without fabricating order data (%#)', async (extra, expected) => {
  await open(extra);
  expect(screen().language).toBe(expected);
  expect(screen().orderSummary).toBeNull();
});
