jest.mock('react-native', () => ({
  Modal: 'Modal', Platform: { OS: 'android', Version: 35 },
  Dimensions: { get: () => ({ width: 412, height: 915 }) },
}));
jest.mock('../ui/TokenizationScreen', () => {
  const React = require('react');
  return function MockTokenizationScreen(props) {
    React.useLayoutEffect(() => {
      const callback = mockScreenLayout;
      mockScreenLayout = undefined;
      callback?.(props);
    });
    return React.createElement('TokenizationScreen', props);
  };
});
jest.mock('../ui/TokenizationPresentation', () => {
  const React = require('react');
  return ({ children, ...props }) => React.createElement('TokenizationPresentation', props, children);
});
jest.mock('../nativeWallets', () => ({ captureApplePayToken: jest.fn(), captureGooglePayToken: jest.fn(), isApplePayTokenizationSupported: jest.fn().mockResolvedValue(false) }));
jest.mock('../../nativePayments', () => ({
  isApplePaySupported: jest.fn().mockResolvedValue(false),
  isGooglePaySupported: jest.fn().mockResolvedValue(false),
  initiateCardPayment: jest.fn(), initiateApplePay: jest.fn(), initiateGooglePay: jest.fn(),
}));
jest.mock('../nativeCards', () => ({ startNativeCardTokenization: jest.fn() }));

const React = require('react');
const renderer = require('react-test-renderer');
const { act } = renderer;
const Component = require('../NgeniusTokenization').default;
const { startNativeCardTokenization } = require('../nativeCards');
const native = require('../../nativePayments');
const { captureApplePayToken, captureGooglePayToken, isApplePayTokenizationSupported } = require('../nativeWallets');
const { UsageType } = require('../usageType');
const { createTokenizationClient } = require('../api/TokenizationClient');
const card = {
  tokenRef: '8a880dc0-d2d2-4067-bcb1-b08d1690b26e', type: 'CARD', status: 'VERIFIED',
  cardDetails: { scheme: 'VISA', last4: '1234', expiry: '2030-12' },
};
const other = {
  ...card, tokenRef: 'd7c1ee99-9478-44a6-b1f2-391e29c6b340',
  cardDetails: { ...card.cardDetails, scheme: 'MASTERCARD' },
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
};
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
let tree, props, mockScreenLayout;
const screen = () => tree.root.findByType('TokenizationScreen').props;
const modal = () => tree.root.findByType('Modal').props;
const defaultClient = () => ({
  createSession: jest.fn(),
  supportsAddWallet: true,
  getSession: jest.fn().mockResolvedValue({ tokens: [card, other], tncUrl: 'https://merchant.test/terms' }),
  selectToken: jest.fn().mockResolvedValue({ status: 'SELECTED' }),
  addWallet: jest.fn(),
});
const open = async (extra = {}) => {
  props = {
    visible: true, outletRef: 'outlet', sessionRef: 'session-1', order: { action: 'VERIFY' },
    tokenizationClient: defaultClient(), skipConsent: true,
    onSelectionComplete: jest.fn(), onSelectSavedToken: jest.fn(),
    onSuccess: jest.fn(), onError: jest.fn(), onCancel: jest.fn(), onResult: jest.fn(), ...extra,
  };
  await act(async () => { tree = renderer.create(React.createElement(Component, props)); await flush(); });
};
const update = async extra => {
  props = { ...props, ...extra };
  await act(async () => { tree.update(React.createElement(Component, props)); await flush(); });
};
const confirm = async (tokenRef = screen().selectedTokenRef) => {
  await act(async () => { screen().onConfirmSavedToken(tokenRef); await flush(); });
};
const advance = async milliseconds => {
  await act(async () => { jest.advanceTimersByTime(milliseconds); await flush(); });
};
const noTokenizationOrPayment = () => {
  expect(props.onSuccess).not.toHaveBeenCalled();
  expect(props.onError).not.toHaveBeenCalled();
  expect(props.onSelectSavedToken).not.toHaveBeenCalled();
  expect(native.initiateCardPayment).not.toHaveBeenCalled();
  expect(native.initiateApplePay).not.toHaveBeenCalled();
  expect(native.initiateGooglePay).not.toHaveBeenCalled();
  expect(captureApplePayToken).not.toHaveBeenCalled();
  expect(captureGooglePayToken).not.toHaveBeenCalled();
  if (props.tokenizationClient.addWallet) expect(props.tokenizationClient.addWallet).not.toHaveBeenCalled();
};
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); startNativeCardTokenization.mockReset(); captureGooglePayToken.mockReset(); });
afterEach(() => {
  if (tree) act(() => tree.unmount());
  tree = undefined;
  mockScreenLayout = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('selects the first eligible imported method on each new launch, without submitting it', async () => {
  const client = defaultClient();
  client.getSession.mockResolvedValue({ tokens: [
    { ...card, tokenRef: 'pending', status: 'AWAIT_3DS', cardDetails: null },
    { ...card, tokenRef: 'malformed', cardDetails: { ...card.cardDetails, last4: '12' } },
    card, other,
  ] });
  await open({ tokenizationClient: client });
  expect(screen().selectedTokenRef).toBe(card.tokenRef);
  act(() => screen().onSelectToken(other.tokenRef));
  expect(screen().selectedTokenRef).toBe(other.tokenRef);
  await update({ visible: false });
  await update({ visible: true });
  expect(screen().selectedTokenRef).toBe(card.tokenRef);
  expect(client.selectToken).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
});

it('retains a manual choice across refresh and native Card Back', async () => {
  const back = deferred();
  startNativeCardTokenization.mockReturnValue({ promise: back.promise, cancel: jest.fn() });
  const client = defaultClient();
  client.getSession.mockResolvedValueOnce({ tokens: [card, other] }).mockResolvedValue({ tokens: [other, card] });
  await open({ tokenizationClient: client });
  act(() => screen().onSelectToken(other.tokenRef));
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  expect(screen().selectedTokenRef).toBe(other.tokenRef);
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).toHaveBeenCalledTimes(1);
  await act(async () => { back.resolve({ state: 'READY' }); await flush(); });
  expect(screen().selectedTokenRef).toBe(other.tokenRef);
  expect(client.selectToken).not.toHaveBeenCalled();
  expect(props.onCancel).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
});

it('selects only the newly verified Card in the same session and closes after confirmation', async () => {
  const creation = deferred();
  const newCard = { ...other, tokenRef: 'f4b9c12c-4d68-4c7d-b7d7-950c644b0099' };
  const acknowledgement = deferred();
  startNativeCardTokenization.mockReturnValue({ promise: creation.promise, cancel: jest.fn() });
  const client = defaultClient();
  client.getSession.mockResolvedValue({ tokens: [card] });
  client.selectToken.mockReturnValue(acknowledgement.promise);
  await open({ tokenizationClient: client });
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).toHaveBeenCalledTimes(1);
  await act(async () => {
    creation.resolve({
      state: 'SUCCESS',
      updatedTokenList: { tokens: [card, newCard] },
    });
    await flush();
  });
  expect(client.createSession).not.toHaveBeenCalled();
  expect(client.getSession).toHaveBeenCalledTimes(1);
  expect(startNativeCardTokenization).toHaveBeenCalledWith(expect.objectContaining({
    sessionRef: 'session-1', usageType: UsageType.PERMANENT,
  }));
  expect(client.selectToken).toHaveBeenCalledTimes(1);
  expect(client.selectToken).toHaveBeenCalledWith({
    outletRef: 'outlet', sessionRef: 'session-1', tokenRef: newCard.tokenRef,
  });
  expect(props.onResult).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  expect(screen().selectionStatus).toBe('submitting');
  expect(modal().visible).toBe(true);
  await act(async () => { acknowledgement.resolve({ status: 'SELECTED' }); await flush(); });
  expect(modal().visible).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  expect(props.onResult).toHaveBeenCalledWith({
    statusCode: 200, message: 'Payment method confirmed.', sessionID: 'session-1',
  });
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
  act(() => screen().onSelectToken(newCard.tokenRef));
  await confirm();
  expect(client.selectToken).toHaveBeenCalledTimes(1);
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
  expect(props.onSelectionComplete).toHaveBeenCalledWith({ flow: 'TOKENIZATION', status: 'SELECTED', canClose: true, sessionRef: 'session-1' });
  expect(JSON.stringify(props.onSelectionComplete.mock.calls)).not.toMatch(/f4b9c12c|cardDetails|savedToken|selectedToken/);
  noTokenizationOrPayment();
});

it('falls back to the first eligible method if refresh removes the manual choice, and clears an empty list', async () => {
  const client = defaultClient();
  client.getSession.mockResolvedValueOnce({ tokens: [card, other] })
    .mockResolvedValueOnce({ tokens: [card] }).mockResolvedValue({ tokens: [] });
  await open({ tokenizationClient: client });
  act(() => screen().onSelectToken(other.tokenRef));
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  expect(screen().selectedTokenRef).toBe(card.tokenRef);
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  expect(screen().selectedTokenRef).toBeNull();
  await confirm(card.tokenRef);
  expect(client.selectToken).not.toHaveBeenCalled();
});

it('rejects stale confirmations in the same event batch as a manual switch or refresh', async () => {
  const refresh = deferred();
  const client = defaultClient();
  client.getSession.mockResolvedValueOnce({ tokens: [card, other] }).mockReturnValue(refresh.promise);
  await open({ tokenizationClient: client });
  const oldConfirm = screen().onConfirmSavedToken;
  act(() => { screen().onSelectToken(other.tokenRef); oldConfirm(card.tokenRef); });
  expect(client.selectToken).not.toHaveBeenCalled();
  const currentConfirm = screen().onConfirmSavedToken;
  await act(async () => { screen().onRetrySavedTokens(); currentConfirm(other.tokenRef); await flush(); });
  expect(screen().savedTokens.loading).toBe(true);
  expect(client.selectToken).not.toHaveBeenCalled();
});

it('shows submitting state while persistence is pending, blocks duplicates, and emits no early completion', async () => {
  const selection = deferred();
  const client = defaultClient();
  client.selectToken.mockReturnValue(selection.promise);
  await open({ tokenizationClient: client, skipConsent: false });
  const handler = screen().onConfirmSavedToken;
  await act(async () => { handler(card.tokenRef); handler(card.tokenRef); await flush(); });
  expect(client.selectToken).toHaveBeenCalledTimes(1);
  expect(client.selectToken).toHaveBeenCalledWith({ outletRef: 'outlet', sessionRef: 'session-1', tokenRef: card.tokenRef });
  expect(screen().selectionStatus).toBe('submitting');
  expect(modal().visible).toBe(true);
  act(() => { screen().onSelectToken(other.tokenRef); screen().onCancel(); });
  expect(screen().selectedTokenRef).toBe(card.tokenRef);
  await advance(10000);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  expect(props.onCancel).not.toHaveBeenCalled();
  noTokenizationOrPayment();
});

it('closes without a success screen as soon as selected-token is acknowledged, with one opaque completion', async () => {
  const selection = deferred();
  const client = defaultClient();
  client.selectToken.mockReturnValue(selection.promise);
  await open({ tokenizationClient: client });
  const handler = screen().onConfirmSavedToken;
  await confirm();
  expect(screen().selectionStatus).toBe('submitting');
  expect(modal().visible).toBe(true);
  expect(props.onResult).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  await act(async () => {
    selection.resolve({ status: 'SELECTED', savedToken: card, tokenRef: card.tokenRef });
    await flush();
  });
  expect(screen().selectionStatus).not.toBe('confirmed');
  expect(modal().visible).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  expect(props.onResult).toHaveBeenCalledTimes(1);
  expect(props.onResult).toHaveBeenCalledWith({
    statusCode: 200, message: 'Payment method confirmed.', sessionID: 'session-1',
  });
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
  expect(props.onSelectionComplete).toHaveBeenCalledWith({ flow: 'TOKENIZATION', status: 'SELECTED', canClose: true, sessionRef: 'session-1' });
  expect(JSON.stringify(props.onSelectionComplete.mock.calls)).not.toMatch(/8a880dc0|cardDetails|savedToken|selectedToken|1234/);
  await act(async () => { handler(card.tokenRef); await flush(); });
  await advance(5000);
  expect(client.selectToken).toHaveBeenCalledTimes(1);
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
  noTokenizationOrPayment();
});

it('keeps a failed request open for retry or another selection without tokenization callbacks', async () => {
  const client = defaultClient();
  client.selectToken.mockRejectedValueOnce(new Error('private backend response'))
    .mockRejectedValueOnce(new Error('retry failed')).mockResolvedValue({ status: 'SELECTED' });
  await open({ tokenizationClient: client });
  await confirm();
  expect(screen().selectionStatus).toBe('failed');
  expect(screen().selectionError).not.toMatch(/private|backend response/);
  expect(modal().visible).toBe(true);
  await advance(3000);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  await confirm();
  expect(client.selectToken).toHaveBeenCalledTimes(2);
  act(() => screen().onSelectToken(other.tokenRef));
  expect(screen().selectionStatus).toBe('idle');
  expect(screen().selectionError).toBeUndefined();
  await confirm();
  expect(client.selectToken).toHaveBeenLastCalledWith({ outletRef: 'outlet', sessionRef: 'session-1', tokenRef: other.tokenRef });
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
  noTokenizationOrPayment();
});

it.each([undefined, { status: 'VERIFIED' }, { status: 'FAILED' }])('does not treat an unconfirmed adapter result as persistence success (%#)', async response => {
  const client = defaultClient();
  client.selectToken.mockResolvedValue(response);
  await open({ tokenizationClient: client });
  await confirm();
  expect(screen().selectionStatus).toBe('failed');
  expect(modal().visible).toBe(true);
  await advance(1800);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  noTokenizationOrPayment();
});

it.each([undefined, '', '../other-session'])('fails without network calls for a missing or malformed sessionRef (%p)', async sessionRef => {
  const client = defaultClient();
  await open({ tokenizationClient: client, sessionRef });
  expect(modal().visible).toBe(false);
  expect(props.onResult).toHaveBeenCalledWith({ statusCode: 400, message: 'Cannot initialize SDK.' });
  expect(client.getSession).not.toHaveBeenCalled();
  expect(client.createSession).not.toHaveBeenCalled();
  await confirm(card.tokenRef);
  expect(client.selectToken).not.toHaveBeenCalled();
});

it('shows a selection configuration error without closing if the method is missing', async () => {
  const client = defaultClient();
  delete client.selectToken;
  await open({ tokenizationClient: client });
  await confirm();
  expect(screen().selectionStatus).toBe('failed');
  expect(screen().selectionError).toBeTruthy();
  expect(modal().visible).toBe(true);
  await advance(1800);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  noTokenizationOrPayment();
});

it('keeps real adapter selection failure open without exposing response bodies', async () => {
  const transport = jest.fn(async request => {
    if (request.method === 'GET') return { status: 200, text: JSON.stringify({ tokens: [card] }) };
    return { status: 409, text: JSON.stringify({ message: `private ${card.tokenRef}` }) };
  });
  const provider = jest.fn(async () => 'fixture-access');
  const client = createTokenizationClient({
    baseUrl: 'https://tokenization.test', transport, getAccessToken: provider,
  });
  jest.spyOn(client, 'addWallet');
  await open({ tokenizationClient: client });
  await confirm();
  expect(screen().selectionStatus).toBe('failed');
  expect(modal().visible).toBe(true);
  expect(transport.mock.calls.map(([request]) => [request.method, request.url])).toEqual([
    ['GET', 'https://tokenization.test/api/outlets/outlet/payment-tokenization-sessions/session-1?consentOff=true'],
    ['PUT', 'https://tokenization.test/api/outlets/outlet/payment-tokenization-sessions/session-1/selected-payment-data'],
  ]);
  expect(provider).toHaveBeenCalledTimes(2);
  expect(screen().selectionError).not.toContain(card.tokenRef);
  await advance(1800);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  noTokenizationOrPayment();
});

it('rejects previous-launch row handlers after close/reopen and previous-session handlers after an outlet change', async () => {
  await open();
  const oldConfirm = screen().onConfirmSavedToken;
  await update({ visible: false });
  await update({ visible: true });
  await act(async () => { oldConfirm(card.tokenRef); await flush(); });
  expect(props.tokenizationClient.selectToken).not.toHaveBeenCalled();
  const previousSessionConfirm = screen().onConfirmSavedToken;
  await update({ outletRef: 'outlet-2', sessionRef: 'session-2' });
  await act(async () => { previousSessionConfirm(card.tokenRef); await flush(); });
  expect(props.tokenizationClient.selectToken).not.toHaveBeenCalled();
  await confirm();
  expect(props.tokenizationClient.selectToken).toHaveBeenCalledWith({ outletRef: 'outlet-2', sessionRef: 'session-2', tokenRef: card.tokenRef });
});

it.each([
  ['Add Card', 'outlet-2'],
  ['Select Token', 'outlet-2'],
  ['Add Card', 'outlet'],
  ['Select Token', 'outlet'],
])('blocks %s during the first render for a different session at %s', async (action, outletRef) => {
  const firstClient = defaultClient();
  const nextClient = defaultClient();
  nextClient.getSession.mockResolvedValue({ tokens: [other] });
  startNativeCardTokenization.mockReturnValue({ promise: new Promise(() => {}), cancel: jest.fn() });
  await open({ tokenizationClient: firstClient });

  const invoke = (screenProps, tokenRef) => action === 'Add Card'
    ? screenProps.onSelectMethod('CARD')
    : screenProps.onConfirmSavedToken(tokenRef);
  // This models an event delivered after the new render, before effects reset the old journey.
  const earlyAction = jest.fn(screenProps => { invoke(screenProps, card.tokenRef); });
  mockScreenLayout = earlyAction;
  await update({ outletRef, sessionRef: 'session-2', tokenizationClient: nextClient });
  expect(earlyAction).toHaveBeenCalledTimes(1);
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
  expect(firstClient.selectToken).not.toHaveBeenCalled();
  expect(nextClient.selectToken).not.toHaveBeenCalled();

  await act(async () => { await invoke(screen(), other.tokenRef); });
  if (action === 'Add Card') {
    expect(startNativeCardTokenization).toHaveBeenCalledWith(expect.objectContaining({
      client: nextClient, outletRef, sessionRef: 'session-2',
    }));
  } else {
    expect(nextClient.selectToken).toHaveBeenCalledWith({
      outletRef, sessionRef: 'session-2', tokenRef: other.tokenRef,
    });
  }
});

const invalidate = async boundary => {
  if (boundary === 'unmount') { act(() => tree.unmount()); tree = undefined; }
  else if (boundary === 'close') await update({ visible: false });
  else if (boundary === 'outlet change') await update({ outletRef: 'outlet-2' });
  else await update({ sessionRef: 'session-2' });
};
it.each(['close', 'unmount', 'outlet change', 'session change'])('ignores a late successful response after %s', async boundary => {
  const pending = deferred();
  const client = defaultClient();
  client.selectToken.mockReturnValue(pending.promise);
  await open({ tokenizationClient: client });
  await confirm();
  await invalidate(boundary);
  await act(async () => { pending.resolve({ status: 'SELECTED' }); await flush(); });
  await advance(3000);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  if (tree) expect(screen().selectionStatus).toBe('idle');
  noTokenizationOrPayment();
});

it.each(['close', 'unmount', 'outlet change', 'session change'])('reports a confirmed selection once and nothing more on a later %s', async boundary => {
  await open();
  await confirm();
  expect(modal().visible).toBe(false);
  await invalidate(boundary);
  await advance(3000);
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
  expect(props.onResult).toHaveBeenCalledTimes(1);
  expect(props.onResult).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 200, sessionID: 'session-1' }));
  expect(props.onCancel).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  noTokenizationOrPayment();
});

it('rejects a stale native Add Card handler after a confirmed selection', async () => {
  startNativeCardTokenization.mockReturnValue({ promise: new Promise(() => {}), cancel: jest.fn() });
  await open();
  const staleAddCard = screen().onSelectMethod;
  await confirm();
  expect(modal().visible).toBe(false);
  await act(async () => { staleAddCard('CARD'); await flush(); });
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
});

it('rejects a previous-session native Add Card handler after the merchant switches the session', async () => {
  startNativeCardTokenization.mockReturnValue({ promise: new Promise(() => {}), cancel: jest.fn() });
  await open();
  const staleAddCard = screen().onSelectMethod;
  await update({ sessionRef: 'session-2' });
  await act(async () => { staleAddCard('CARD'); await flush(); });
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
});

it.each(['outlet', 'reopen'])('replaces the session methods and order snapshot and clears old add feedback on a new %s context', async boundary => {
  // Init order paymentMethods contradict the session on purpose: only Get Session decides.
  const firstOrder = {
    action: 'VERIFY', amount: { currencyCode: 'AED', value: 100 },
    paymentMethods: { card: [], wallet: ['GOOGLE_PAY'] },
  };
  const nextOrder = {
    action: 'VERIFY', amount: { currencyCode: 'USD', value: 200 },
    paymentMethods: { card: ['VISA'], wallet: [] },
  };
  native.isGooglePaySupported.mockResolvedValueOnce(true);
  if (boundary === 'reopen') native.isGooglePaySupported.mockResolvedValueOnce(true);
  captureGooglePayToken.mockResolvedValueOnce({ token: 'fixture-encrypted-wallet' });
  startNativeCardTokenization.mockReturnValueOnce({
    promise: Promise.resolve({ state: 'FAILED', result: { status: 'FAILED' } }), cancel: jest.fn(),
  });
  const client = defaultClient();
  client.getSession
    .mockResolvedValueOnce({ tokens: [card], paymentMethods: { card: ['VISA'], wallet: [] } })
    .mockResolvedValue({ tokens: [card], paymentMethods: { card: [], wallet: ['GOOGLE_PAY'] }, amount: { currencyCode: 'KWD' } });
  client.addWallet.mockResolvedValue({ tokens: [{ ...card, type: 'WALLET', walletType: 'GOOGLE_PAY' }] });
  await open({ order: firstOrder, tokenizationClient: client });
  expect(screen().methods).toEqual(['CARD']);
  expect(screen().orderSummary).toBeNull();
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(screen().status).toBe('FAILED');
  expect(screen().errorMessage).toBeTruthy();

  // Ordinary order prop updates keep the active session's original snapshot.
  await update({ order: nextOrder });
  expect(screen().methods).toEqual(['CARD']);
  expect(screen().orderSummary).toBeNull();
  expect(screen().status).toBe('FAILED');

  if (boundary === 'reopen') {
    await update({ visible: false });
    await update({ visible: true });
  } else await update({ outletRef: 'outlet-2' });
  expect(screen().status).toBe('READY');
  expect(screen().errorMessage).toBeUndefined();
  expect(screen().methods).toEqual(['GOOGLE_PAY']);
  expect(screen().orderSummary).toBeNull();
  await act(async () => { screen().onSelectMethod('GOOGLE_PAY'); await flush(); });
  expect(captureGooglePayToken).toHaveBeenCalledWith({
    ...nextOrder, amount: { currencyCode: 'KWD', value: 0, formattedValue: '0.000' },
  }, undefined);
  expect(nextOrder.amount).toEqual({ currencyCode: 'USD', value: 200 });
});

it('ignores a late Get result after a same-outlet session change', async () => {
  const first = deferred();
  const client = defaultClient();
  client.getSession.mockReturnValueOnce(first.promise).mockResolvedValue({ tokens: [other] });
  await open({ tokenizationClient: client });
  expect(screen().savedTokens.loading).toBe(true);
  await update({ sessionRef: 'session-2' });
  await act(async () => { first.resolve({ tokens: [card] }); await flush(); });

  expect(screen().savedTokens.tokens).toEqual([other]);
  expect(client.getSession).toHaveBeenLastCalledWith({ outletRef: 'outlet', sessionRef: 'session-2', skipConsent: true });
  await confirm();
  expect(client.selectToken).toHaveBeenCalledWith({ outletRef: 'outlet', sessionRef: 'session-2', tokenRef: other.tokenRef });
});

it('uses the currency from the latest current Get Session for wallet capture without init order context', async () => {
  native.isGooglePaySupported.mockResolvedValueOnce(true);
  captureGooglePayToken.mockRejectedValue({ status: 'Aborted' });
  const client = defaultClient();
  client.getSession.mockResolvedValueOnce({ tokens: [], amount: { currencyCode: 'JPY', value: '1000' }, paymentMethods: { wallet: ['GOOGLE_PAY'] } })
    .mockResolvedValue({ tokens: [], amount: { currencyCode: 'BHD', value: '2500' }, paymentMethods: { wallet: ['GOOGLE_PAY'] } });
  await open({ order: undefined, tokenizationClient: client });
  await act(async () => { screen().onSelectMethod('GOOGLE_PAY'); await flush(); });
  expect(captureGooglePayToken).toHaveBeenLastCalledWith({
    amount: { currencyCode: 'JPY', value: 0, formattedValue: '0' },
  }, undefined);
  await update({ order: { amount: { currencyCode: 'USD', value: 100 } } });
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  await act(async () => { screen().onSelectMethod('GOOGLE_PAY'); await flush(); });
  expect(captureGooglePayToken).toHaveBeenLastCalledWith({
    amount: { currencyCode: 'BHD', value: 0, formattedValue: '0.000' },
  }, undefined);
  expect(client.addWallet).not.toHaveBeenCalled();
  expect(client.selectToken).not.toHaveBeenCalled();
  expect(native.initiateGooglePay).not.toHaveBeenCalled();
});

it.each([
  ['android', undefined], ['android', { currencyCode: 'ZZZ' }],
  ['ios', undefined], ['ios', { currencyCode: 'PRIVATE' }],
])('rejects missing or invalid session currency before opening the %s wallet (%#)', async (platform, amount) => {
  const { Platform } = require('react-native');
  const originalPlatform = Platform.OS;
  Platform.OS = platform;
  if (platform === 'android') native.isGooglePaySupported.mockResolvedValueOnce(true);
  else native.isApplePaySupported.mockResolvedValueOnce(true);
  try {
    const client = defaultClient();
    client.getSession.mockResolvedValue({ tokens: [], amount, paymentMethods: { wallet: ['APPLE_PAY', 'GOOGLE_PAY'] } });
    await open({ tokenizationClient: client, order: { amount: { currencyCode: 'AED', value: 100 } } });
    await act(async () => { screen().onSelectMethod(platform === 'ios' ? 'APPLE_PAY' : 'GOOGLE_PAY'); await flush(); });
    expect(captureGooglePayToken).not.toHaveBeenCalled();
    expect(captureApplePayToken).not.toHaveBeenCalled();
    expect(client.addWallet).not.toHaveBeenCalled();
    expect(client.selectToken).not.toHaveBeenCalled();
    expect(modal().visible).toBe(true);
    expect(screen().status).toBe('FAILED');
    expect(props.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_WALLET_REQUEST' }));
    expect(JSON.stringify(props.onError.mock.calls)).not.toContain('PRIVATE');
  } finally {
    Platform.OS = originalPlatform;
    native.isApplePaySupported.mockResolvedValue(false);
    native.isGooglePaySupported.mockResolvedValue(false);
  }
});

it('shows only the current Get Session amount and preserves it through Add Card', async () => {
  const initial = deferred();
  const next = deferred();
  const client = defaultClient();
  client.getSession.mockReturnValueOnce(initial.promise).mockReturnValueOnce(next.promise);
  const initAmount = { currencyCode: 'AED', value: 100 };
  await open({ tokenizationClient: client, order: { amount: initAmount },
    orderDetails: { amount: initAmount, orderSummary: { total: initAmount } },
    modeConfig: { addCardsBeforePay: true } });
  expect(screen().orderSummary).toBeNull();

  const amount = { currencyCode: 'AED', value: 3910 };
  await act(async () => { initial.resolve({ tokens: [], amount }); await flush(); });
  expect(screen().orderSummary.amount.text).toBe('AED 39.10');

  startNativeCardTokenization.mockReturnValue({
    promise: Promise.resolve({ state: 'SUCCESS', updatedTokenList: { tokens: [card], amount: initAmount } }),
    cancel: jest.fn(),
  });
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(screen().orderSummary.amount.text).toBe('AED 39.10');
  expect(client.getSession).toHaveBeenCalledTimes(1);

  await update({ sessionRef: 'session-2' });
  expect(screen().orderSummary).toBeNull();
  await act(async () => { next.resolve({ tokens: [] }); await flush(); });
  expect(screen().orderSummary).toBeNull();
});

it('opens a fresh checkout with a replacement client after an initialization failure', async () => {
  const expired = defaultClient();
  expired.getSession.mockRejectedValue(new Error('expired access token'));
  const replacement = defaultClient();
  await open({ tokenizationClient: expired });
  expect(modal().visible).toBe(false);

  await update({ visible: false, tokenizationClient: replacement });
  await update({ visible: true });
  const request = { outletRef: 'outlet', sessionRef: 'session-1', skipConsent: true };
  expect(expired.getSession).toHaveBeenCalledTimes(1);
  expect(expired.getSession).toHaveBeenCalledWith(request);
  expect(replacement.getSession).toHaveBeenCalledTimes(1);
  expect(replacement.getSession).toHaveBeenCalledWith(request);
  expect(expired.createSession).not.toHaveBeenCalled();
  expect(replacement.createSession).not.toHaveBeenCalled();
  expect(screen().savedTokens).toMatchObject({ failed: false, tokens: [card, other] });
});

it('keeps the bound client and session when retrying a refresh after a successful Get', async () => {
  const client = defaultClient();
  const replacement = defaultClient();
  startNativeCardTokenization.mockReturnValue({
    promise: Promise.resolve({ state: 'READY' }), cancel: jest.fn(),
  });
  await open({ tokenizationClient: client });
  client.getSession.mockRejectedValueOnce(new Error('try again')).mockResolvedValue({ tokens: [other] });
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  expect(screen().savedTokens.failed).toBe(true);
  await update({ tokenizationClient: replacement });
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });

  expect(client.getSession).toHaveBeenCalledTimes(3);
  expect(client.getSession).toHaveBeenLastCalledWith({ outletRef: 'outlet', sessionRef: 'session-1', skipConsent: true });
  expect(screen().savedTokens.tokens).toEqual([other]);
  await act(async () => { await screen().onSelectMethod('CARD'); });
  expect(startNativeCardTokenization).toHaveBeenCalledWith(expect.objectContaining({
    client, outletRef: 'outlet', sessionRef: 'session-1',
  }));
  await confirm(other.tokenRef);
  expect(client.selectToken).toHaveBeenCalledWith({ outletRef: 'outlet', sessionRef: 'session-1', tokenRef: other.tokenRef });
  expect(replacement.getSession).not.toHaveBeenCalled();
  expect(replacement.selectToken).not.toHaveBeenCalled();
});

it.each(['PRIVATE_INVALID_VALUE', null, NaN])('blocks an invalid explicit tokenType before native entry (%p)', async tokenType => {
  await open({ modeConfig: { tokenType } });
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
  expect(props.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_USAGE_TYPE' }));
  expect(JSON.stringify(props.onError.mock.calls)).not.toContain('PRIVATE');
});

it('uses the explicit ONCE_OFF type for Card Pay and confirms the new card', async () => {
  const client = defaultClient();
  client.getSession.mockResolvedValue({ tokens: [] });
  startNativeCardTokenization.mockReturnValue({
    promise: Promise.resolve({ state: 'SUCCESS', updatedTokenList: { tokens: [card] } }), cancel: jest.fn(),
  });
  await open({ tokenizationClient: client, modeConfig: { tokenType: UsageType.ONCE_OFF } });
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).toHaveBeenCalledWith(expect.objectContaining({
    sessionRef: 'session-1', usageType: UsageType.ONCE_OFF,
  }));
  expect(client.createSession).not.toHaveBeenCalled();
  expect(client.getSession).toHaveBeenCalledTimes(1);
  expect(client.selectToken).toHaveBeenCalledWith({
    outletRef: 'outlet', sessionRef: 'session-1', tokenRef: card.tokenRef,
  });
  expect(modal().visible).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  expect(props.onResult).toHaveBeenCalledTimes(1);
  expect(props.onResult).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 200, sessionID: 'session-1' }));
});

it('keeps a new Card open with a recoverable error when selected-token fails after Add', async () => {
  const client = defaultClient();
  client.getSession.mockResolvedValue({ tokens: [] });
  client.selectToken.mockRejectedValueOnce(new Error('private backend response')).mockResolvedValue({ status: 'SELECTED' });
  startNativeCardTokenization.mockReturnValue({
    promise: Promise.resolve({ state: 'SUCCESS', updatedTokenList: { tokens: [card] } }), cancel: jest.fn(),
  });
  await open({ tokenizationClient: client });
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(client.selectToken).toHaveBeenCalledTimes(1);
  expect(screen().selectionStatus).toBe('failed');
  expect(screen().selectionError).not.toMatch(/private|backend response/);
  expect(screen().savedTokens.tokens).toEqual([card]);
  expect(modal().visible).toBe(true);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  expect(props.onResult).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 200 }));
  act(() => screen().onSelectToken(card.tokenRef));
  await confirm();
  expect(client.getSession).toHaveBeenCalledTimes(1);
  expect(modal().visible).toBe(false);
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
});

it.each([
  ['listed schemes', { card: ['MASTERCARD', 'JCB', 'JCB', 'UNKNOWN', null], wallet: ['APPLE_PAY'] }, ['Mastercard', 'JCB']],
  ['no paymentMethods', undefined, []],
  ['an empty paymentMethods object', {}, []],
  ['a nested orderDetails.paymentMethods, which is not the contract', undefined, [], { orderDetails: { paymentMethods: { card: ['VISA'] } } }],
])('passes only Get Session card logos to the native form with %s', async (_case, paymentMethods, expected, extra = {}) => {
  const client = createTokenizationClient({
    baseUrl: 'https://paypage.example',
    getAccessToken: async () => 'test-token',
    transport: async () => ({ status: 200, text: JSON.stringify({ tokens: [], paymentMethods, ...extra }) }),
  });
  startNativeCardTokenization.mockReturnValue({
    promise: Promise.resolve({ state: 'READY' }),
    cancel: jest.fn(),
  });
  await open({ tokenizationClient: client, order: { paymentMethods: { card: ['AMEX'] } } });
  await act(async () => { await screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).toHaveBeenCalledWith(expect.objectContaining({
    presentation: expect.objectContaining({ acceptedSchemes: expected }),
  }));
});

it.each([
  ['no paymentMethods prop', undefined, false],
  ['only CONTINUE_SHOPPING', ['CONTINUE_SHOPPING'], true],
])('takes card checkout context from Get Session without init business data (%s)', async (_case, paymentMethods, returnAction) => {
  const client = createTokenizationClient({
    baseUrl: 'https://paypage.example',
    getAccessToken: async () => 'test-token',
    transport: async () => ({ status: 200, text: JSON.stringify({
      advisedTokens: [],
      paymentMethods: { card: ['VISA', 'MASTERCARD'] },
      orderDetails: { action: 'AUTH', amount: { currencyCode: 'AED', value: 1500 } },
    }) }),
  });
  startNativeCardTokenization.mockReturnValue({ promise: Promise.resolve({ state: 'READY' }), cancel: jest.fn() });
  await open({ tokenizationClient: client, order: undefined, paymentMethods });
  expect(screen().methods).toEqual(['CARD']);
  expect(screen().orderSummary.amount.text).toBe('AED 15.00');
  expect(screen().showContinueShopping).toBe(returnAction);
  await act(async () => { await screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).toHaveBeenCalledWith(expect.objectContaining({
    presentation: expect.objectContaining({ acceptedSchemes: ['Visa', 'Mastercard'] }),
  }));
  expect(props.onError).not.toHaveBeenCalled();
});

it.each([
  ['an explicitly empty card list', { card: [] }],
  ['malformed method lists', { card: 'VISA', wallet: 'APPLE_PAY' }],
  ['a malformed configuration', ['VISA']],
  ['unknown methods only', { apm: ['TABBY'] }],
])('does not open the card form when Get Session returns %s', async (_case, paymentMethods) => {
  const client = createTokenizationClient({
    baseUrl: 'https://paypage.example',
    getAccessToken: async () => 'test-token',
    transport: async () => ({ status: 200, text: JSON.stringify({ advisedTokens: [card], paymentMethods, orderDetails: { action: 'AUTH', amount: { currencyCode: 'AED', value: 1500 } } }) }),
  });
  await open({ tokenizationClient: client, order: { paymentMethods: { card: ['VISA'] } }, paymentMethods: ['CARD'] });
  expect(screen().methods).toEqual([]);
  expect(screen().savedTokens.tokens).toEqual([{ ...card, walletType: null }]);
  await act(async () => { await screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
  expect(props.onError).not.toHaveBeenCalled();
});

it.each(['ios', 'android'])('adds and explicitly selects a card with empty session paymentMethods on %s', async platform => {
  const { Platform } = require('react-native');
  const originalPlatform = Platform.OS;
  Platform.OS = platform;
  try {
    const parser = createTokenizationClient({
      baseUrl: 'https://paypage.example',
      getAccessToken: async () => 'test-token',
      transport: async () => ({ status: 200, text: JSON.stringify({
        advisedTokens: [], paymentMethods: {},
        orderDetails: { action: 'AUTH', amount: { currencyCode: 'AED', value: 1500 } },
      }) }),
    });
    const client = defaultClient();
    client.getSession.mockImplementation(options => parser.getSession(options));
    const creation = deferred();
    startNativeCardTokenization.mockReturnValue({ promise: creation.promise, cancel: jest.fn() });
    await open({ tokenizationClient: client, modeConfig: { addCardsBeforePay: true, tokenType: UsageType.ONCE_OFF } });
    expect(screen().methods).toEqual(['CARD']);
    expect(screen().orderSummary.amount.text).toBe('AED 15.00');
    await act(async () => { await screen().onSelectMethod('CARD'); await flush(); });
    expect(startNativeCardTokenization).toHaveBeenCalledWith(expect.objectContaining({
      sessionRef: 'session-1',
      usageType: UsageType.ONCE_OFF,
      presentation: expect.objectContaining({
        acceptedSchemes: [], labels: expect.objectContaining({ title: 'Add new card', submit: 'Add Card' }),
      }),
    }));
    await act(async () => { creation.resolve({ state: 'SUCCESS', updatedTokenList: { tokens: [card] } }); await flush(); });
    expect(screen().savedTokens.tokens).toEqual([card]);
    expect(screen().methods).toEqual(['CARD']);
    expect(screen().selectedTokenRef).toBeNull();
    expect(client.selectToken).not.toHaveBeenCalled();
    expect(props.onResult).not.toHaveBeenCalled();
    act(() => screen().onSelectToken(card.tokenRef));
    await confirm();
    expect(client.selectToken).toHaveBeenCalledWith({ outletRef: 'outlet', sessionRef: 'session-1', tokenRef: card.tokenRef });
    expect(props.onResult).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 200, sessionID: 'session-1' }));
  } finally {
    Platform.OS = originalPlatform;
  }
});

it.each(['ios', 'android'])('offers only the platform wallet that Get Session allows on %s', async platform => {
  const { Platform } = require('react-native');
  const originalPlatform = Platform.OS;
  Platform.OS = platform;
  try {
    native.isApplePaySupported.mockResolvedValue(true);
    native.isGooglePaySupported.mockResolvedValue(true);
    const client = defaultClient();
    client.getSession.mockResolvedValue({ tokens: [], paymentMethods: { card: ['VISA'], wallet: ['APPLE_PAY', 'GOOGLE_PAY'] } });
    await open({ tokenizationClient: client, order: { paymentMethods: { wallet: [] } } });
    expect(screen().methods).toEqual(['CARD', platform === 'ios' ? 'APPLE_PAY' : 'GOOGLE_PAY']);

    client.getSession.mockResolvedValue({ tokens: [], paymentMethods: { card: ['VISA'], wallet: [] } });
    await act(async () => { screen().onRetrySavedTokens(); await flush(); });
    expect(screen().methods).toEqual(['CARD']);
  } finally {
    Platform.OS = originalPlatform;
    native.isApplePaySupported.mockResolvedValue(false);
    native.isGooglePaySupported.mockResolvedValue(false);
  }
});

it.each([
  ['loading', () => new Promise(() => {})],
  ['an initialization error', () => Promise.reject({ status: 503 })],
])('shows no amount or methods while %s, even with init order amounts', async (_case, getSession) => {
  const client = defaultClient();
  client.getSession.mockImplementation(getSession);
  const initAmount = { currencyCode: 'AED', value: 1500 };
  await open({ tokenizationClient: client, order: { amount: initAmount },
    orderDetails: { amount: initAmount, orderSummary: { total: initAmount } } });
  expect(screen().orderSummary).toBeNull();
  expect(screen().methods).toEqual([]);
});

it.each([
  [{ maskPaymentInfo: false }, false],
  [{ maskPaymentInfo: 'false' }, false],
  [{ order: { merchantAttributes: { maskPaymentInfo: 'false' } } }, false],
  [{ maskPaymentInfo: true }, true],
  [{ maskPaymentInfo: 'true' }, true],
  [{ order: { merchantAttributes: { maskPaymentInfo: 'true' } } }, true],
  [{ maskPaymentInfo: null }, false],
  [{ maskPaymentInfo: 'invalid' }, false],
  [{}, false],
])('passes the session masking setting %j to the card form', async (sessionFields, expected) => {
  const client = createTokenizationClient({
    baseUrl: 'https://paypage.example',
    getAccessToken: async () => 'test-token',
    transport: async () => ({ status: 200, text: JSON.stringify({ tokens: [], ...sessionFields }) }),
  });
  startNativeCardTokenization.mockReturnValue({
    promise: Promise.resolve({ state: 'READY' }),
    cancel: jest.fn(),
  });
  await open({ tokenizationClient: client });
  await act(async () => { await screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).toHaveBeenCalledWith(expect.objectContaining({
    presentation: expect.objectContaining({ maskPaymentInfo: expected }),
  }));
});

it('adds two cards in one session and only confirms the card the shopper chooses to pay with', async () => {
  const client = defaultClient();
  client.getSession.mockResolvedValue({ tokens: [] });
  for (const tokens of [[card], [card, other]]) {
    startNativeCardTokenization.mockReturnValueOnce({
      promise: Promise.resolve({ state: 'SUCCESS', updatedTokenList: { tokens } }),
      cancel: jest.fn(),
    });
  }
  await open({ tokenizationClient: client, modeConfig: { addCardsBeforePay: true, tokenType: UsageType.ONCE_OFF } });
  for (const tokens of [[card], [card, other]]) {
    await act(async () => { await screen().onSelectMethod('CARD'); await flush(); });
    expect(screen().savedTokens.tokens).toEqual(tokens);
    expect(screen().selectedTokenRef).toBeNull();
    expect(modal().visible).toBe(true);
    expect(client.selectToken).not.toHaveBeenCalled();
    expect(props.onResult).not.toHaveBeenCalled();
  }
  expect(startNativeCardTokenization).toHaveBeenCalledTimes(2);
  for (const [request] of startNativeCardTokenization.mock.calls) {
    expect(request).toMatchObject({
      sessionRef: 'session-1',
      usageType: UsageType.ONCE_OFF,
      presentation: { labels: { title: 'Add new card', submit: 'Add Card' } },
    });
  }
  expect(client.getSession).toHaveBeenCalledTimes(1);
  act(() => screen().onSelectToken(other.tokenRef));
  expect(client.selectToken).not.toHaveBeenCalled();
  await confirm();
  expect(client.selectToken).toHaveBeenCalledTimes(1);
  expect(client.selectToken).toHaveBeenCalledWith({
    outletRef: 'outlet', sessionRef: 'session-1', tokenRef: other.tokenRef,
  });
  expect(modal().visible).toBe(false);
  expect(props.onResult).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 200, sessionID: 'session-1' }));
});

it('returns to the chooser with a safe failure instead of showing or confirming a failed card', async () => {
  const client = defaultClient();
  const failed = { ...other, status: 'FAILED' };
  client.getSession.mockResolvedValue({ tokens: [card, failed] });
  startNativeCardTokenization.mockReturnValue({
    promise: Promise.resolve({
      state: 'FAILED', result: { status: 'FAILED', httpStatus: 422, error: 'private response' },
    }), cancel: jest.fn(),
  });
  await open({ tokenizationClient: client });
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(modal().visible).toBe(true);
  expect(screen().savedTokens.tokens).toEqual([card]);
  expect(screen().status).toBe('FAILED');
  expect(screen().errorMessage).not.toContain('private');
  expect(client.selectToken).not.toHaveBeenCalled();
  expect(props.onResult).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422, sessionID: 'session-1' }));
});

it.each([401, 404, 503])('closes on initialization HTTP %s and reports one error with no session ID', async status => {
  const client = defaultClient();
  client.getSession.mockRejectedValue({ status, message: 'private response' });
  await open({ tokenizationClient: client });
  expect(modal().visible).toBe(false);
  expect(screen().loadError).toBeUndefined();
  expect(props.onResult).toHaveBeenCalledWith({ statusCode: status, message: expect.stringContaining('Cannot initialize SDK') });
  await update({ visible: false });
  expect(props.onResult).toHaveBeenCalledTimes(1);
  expect(props.onCancel).not.toHaveBeenCalled();
});

const timeoutErrors = [
  { code: 'REQUEST_TIMEOUT' },
  { status: 408 },
  { status: 504 },
];
// Manual dismissal keeps the legacy onCancel UI event. The terminal merchant
// outcome must remain the single 408 result, never a later cancellation/499.
it.each(timeoutErrors)('closes once on initialization timeout without returning a session ID (%j)', async error => {
  const client = defaultClient();
  client.getSession.mockRejectedValue({ ...error, message: 'private response' });
  await open({ tokenizationClient: client });
  expect(modal().visible).toBe(false);
  expect(props.onResult).toHaveBeenCalledWith({ statusCode: 408, message: 'Cannot initialize SDK: request timed out.' });
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  await act(async () => { screen().onRetrySavedTokens(); screen().onCancel('cancel'); await flush(); });
  await update({ visible: false });
  expect(client.getSession).toHaveBeenCalledTimes(1);
  expect(props.onResult).toHaveBeenCalledTimes(1);
  expect(props.onCancel).not.toHaveBeenCalled();
});

it.each(timeoutErrors)('makes a refresh timeout terminal with disabled actions and no retry (%j)', async error => {
  const client = defaultClient();
  await open({ tokenizationClient: client });
  client.getSession.mockRejectedValueOnce({ ...error, message: 'private response' });
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  expect(screen().loadError).toMatch(/couldn't confirm the result in time/i);
  expect(screen().actionsDisabled).toBe(true);
  expect(screen().canRetryLoad).toBe(false);
  expect(props.onResult).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 408, sessionID: 'session-1' }));
  await act(async () => {
    screen().onRetrySavedTokens(); screen().onSelectMethod('CARD');
    screen().onSelectToken(other.tokenRef); screen().onConfirmSavedToken(card.tokenRef);
    await flush();
  });
  expect(client.getSession).toHaveBeenCalledTimes(2);
  expect(client.selectToken).not.toHaveBeenCalled();
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  act(() => { screen().onCancel('swipe'); screen().onCancel('cancel'); });
  await update({ visible: false });
  expect(props.onResult).toHaveBeenCalledTimes(1);
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

it.each(timeoutErrors)('makes a selected-token timeout terminal without confirming, retrying, or cancelling the result (%j)', async error => {
  const client = defaultClient();
  client.selectToken.mockRejectedValue({ ...error, message: 'private response' });
  await open({ tokenizationClient: client });
  await confirm();
  expect(modal().visible).toBe(true);
  expect(screen().selectionStatus).toBe('failed');
  expect(screen().selectionError).toMatch(/couldn't confirm the result in time/i);
  expect(screen().actionsDisabled).toBe(true);
  expect(screen().canRetryLoad).toBe(false);
  expect(props.onResult).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 408, sessionID: 'session-1' }));
  await act(async () => {
    screen().onSelectToken(other.tokenRef); screen().onRetrySavedTokens(); screen().onSelectMethod('CARD');
    await flush();
  });
  await confirm();
  expect(screen().selectedTokenRef).toBe(card.tokenRef);
  expect(client.selectToken).toHaveBeenCalledTimes(1);
  expect(client.getSession).toHaveBeenCalledTimes(1);
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  act(() => { screen().onCancel('swipe'); screen().onCancel('cancel'); });
  await update({ visible: false });
  expect(props.onResult).toHaveBeenCalledTimes(1);
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

it.each(timeoutErrors)('keeps a native Add timeout fatal without selecting a token or overwriting it on dismissal (%j)', async error => {
  startNativeCardTokenization.mockReturnValue({
    promise: Promise.resolve({ state: 'FAILED', result: { ...error, status: error.status || 'FAILED', message: 'private response' } }),
    cancel: jest.fn(),
  });
  const client = defaultClient();
  await open({ tokenizationClient: client });
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(screen().status).toBe('FAILED');
  expect(screen().errorMessage).toMatch(/couldn't confirm the result in time/i);
  expect(screen().actionsDisabled).toBe(true);
  expect(screen().savedTokens.tokens).toEqual([card, other]);
  expect(client.selectToken).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  expect(props.onResult).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 408, sessionID: 'session-1' }));
  await act(async () => { screen().onSelectMethod('CARD'); screen().onRetrySavedTokens(); await flush(); });
  await confirm();
  expect(startNativeCardTokenization).toHaveBeenCalledTimes(1);
  expect(client.getSession).toHaveBeenCalledTimes(1);
  expect(client.selectToken).not.toHaveBeenCalled();
  act(() => { screen().onCancel('swipe'); screen().onCancel('cancel'); });
  await update({ visible: false });
  expect(props.onResult).toHaveBeenCalledTimes(1);
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

it.each(['READY', 'FAILED'])('keeps the iOS chooser presented when the native card form returns %s', async state => {
  const { Platform } = require('react-native');
  const originalPlatform = Platform.OS;
  Platform.OS = 'ios';
  try {
    const cardForm = deferred();
    startNativeCardTokenization.mockReturnValue({ promise: cardForm.promise, cancel: jest.fn() });
    await open();
    act(() => modal().onShow());
    act(() => { screen().onSelectMethod('CARD'); });
    expect(startNativeCardTokenization).toHaveBeenCalledTimes(1);
    expect(modal().visible).toBe(true);
    expect(tree.root.findByType('TokenizationPresentation').props.shown).toBe(true);
    await act(async () => { cardForm.resolve({ state }); await flush(); });
    expect(modal().visible).toBe(true);
    expect(tree.root.findByType('TokenizationPresentation').props.shown).toBe(true);
    expect(screen().status).toBe(state);
  } finally {
    Platform.OS = originalPlatform;
  }
});

it('maps an expired native Card credential to 402 and preserves that outcome on dismissal', async () => {
  startNativeCardTokenization.mockReturnValue({
    promise: Promise.resolve({ state: 'FAILED', result: { status: 'FAILED', httpStatus: 401 } }),
    cancel: jest.fn(),
  });
  await open();
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(screen().errorMessage).toMatch(/expired/i);
  expect(screen().actionsDisabled).toBe(true);
  expect(props.onResult).toHaveBeenCalledWith({
    statusCode: 402, message: expect.stringContaining('expired'), sessionID: 'session-1',
  });
  act(() => screen().onCancel('swipe'));
  expect(props.onResult).toHaveBeenCalledTimes(1);
});

it.each(['swipe', 'backdrop', 'continueShopping', 'cancel'])('reports %s once when the shopper leaves', async reason => {
  await open();
  act(() => { screen().onCancel(reason); screen().onCancel(reason); });
  await update({ visible: false });
  expect(props.onResult).toHaveBeenCalledTimes(1);
  expect(props.onResult).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 499, sessionID: 'session-1' }));
});

it('reports a host close once when the shopper never tapped Cancel', async () => {
  await open();
  await update({ visible: false });
  expect(props.onResult).toHaveBeenCalledWith({
    statusCode: 499, message: 'Checkout closed by the merchant app.', sessionID: 'session-1',
  });
  expect(props.onCancel).not.toHaveBeenCalled();
});


it('checks explicit Apple networks before offering tokenization and does not broaden to generic device readiness', async () => {
  const { Platform } = require('react-native');
  const previousPlatform = Platform.OS;
  const config = { merchantIdentifier: 'merchant.test', countryCode: 'AE', supportedNetworks: ['VISA'] };
  Platform.OS = 'ios';
  native.isApplePaySupported.mockResolvedValue(true);
  isApplePayTokenizationSupported.mockResolvedValue(false);
  const client = defaultClient();
  client.getSession.mockResolvedValue({ tokens: [], paymentMethods: { wallet: ['APPLE_PAY'] }, amount: { currencyCode: 'AED', value: 1500 } });
  try {
    await open({ tokenizationClient: client, applePayConfig: config });
    expect(isApplePayTokenizationSupported).toHaveBeenCalledWith(config);
    expect(native.isApplePaySupported).not.toHaveBeenCalled();
    expect(screen().methods).toEqual([]);
    await act(async () => { tree.unmount(); });
    tree = undefined;
    isApplePayTokenizationSupported.mockResolvedValue(true);
    await open({ tokenizationClient: client, applePayConfig: config });
    expect(screen().methods).toEqual(['APPLE_PAY']);
  } finally {
    Platform.OS = previousPlatform;
    native.isApplePaySupported.mockResolvedValue(false);
    isApplePayTokenizationSupported.mockResolvedValue(false);
  }
});
