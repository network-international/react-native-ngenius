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
jest.mock('../nativeWallets', () => ({ captureApplePayToken: jest.fn() }));
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
const { captureApplePayToken } = require('../nativeWallets');
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
    onSuccess: jest.fn(), onError: jest.fn(), onCancel: jest.fn(), ...extra,
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
  if (props.tokenizationClient.addWallet) expect(props.tokenizationClient.addWallet).not.toHaveBeenCalled();
};
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); startNativeCardTokenization.mockReset(); });
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

it('uses the updated list after native Add Card with no extra Get or Create without returning card metadata or completing selection', async () => {
  const creation = deferred();
  const newCard = { ...other, tokenRef: 'f4b9c12c-4d68-4c7d-b7d7-950c644b0099' };
  startNativeCardTokenization.mockReturnValue({ promise: creation.promise, cancel: jest.fn() });
  const client = defaultClient();
  client.getSession.mockResolvedValue({ tokens: [card] });
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
  expect(screen().selectedTokenRef).toBe(card.tokenRef);
  expect(screen().savedTokens.tokens).toEqual([card, newCard]);
  expect(screen().status).toBe('READY');
  expect(screen().tokenSaved).toBe(true);
  expect(screen().selectionStatus).toBe('idle');
  expect(modal().visible).toBe(true);
  expect(client.selectToken).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  noTokenizationOrPayment();
  act(() => screen().onSelectToken(newCard.tokenRef));
  await confirm();
  expect(client.selectToken).toHaveBeenCalledWith({
    outletRef: 'outlet', sessionRef: 'session-1', tokenRef: newCard.tokenRef,
  });
  expect(screen().selectionStatus).toBe('confirmed');
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  await advance(1100);
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
  expect(screen().consentAccepted).toBe(false);
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

it('confirms persistence, shows the success phase for 1100 ms, then closes with one opaque completion', async () => {
  const client = defaultClient();
  client.selectToken.mockResolvedValue({ status: 'SELECTED', savedToken: card, tokenRef: card.tokenRef });
  await open({ tokenizationClient: client });
  const handler = screen().onConfirmSavedToken;
  await confirm();
  expect(screen().selectionStatus).toBe('confirmed');
  expect(modal().visible).toBe(true);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  await advance(1099);
  expect(modal().visible).toBe(true);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  await advance(1);
  expect(modal().visible).toBe(false);
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
  await advance(1100);
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
  await advance(1100);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  noTokenizationOrPayment();
});

it.each([undefined, '', '../other-session'])('fails without network calls for a missing or malformed sessionRef (%p)', async sessionRef => {
  const client = defaultClient();
  await open({ tokenizationClient: client, sessionRef });
  expect(screen().savedTokens).toMatchObject({ failed: true, tokens: [] });
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
  await advance(1100);
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
    ['PUT', 'https://tokenization.test/api/outlets/outlet/payment-tokenization-sessions/session-1/selected-token'],
  ]);
  expect(provider).toHaveBeenCalledTimes(2);
  expect(screen().selectionError).not.toContain(card.tokenRef);
  await advance(1100);
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

it.each(['close', 'unmount', 'outlet change', 'session change'])('cancels the confirmed-success timer on %s', async boundary => {
  await open();
  await confirm();
  expect(screen().selectionStatus).toBe('confirmed');
  await advance(500);
  await invalidate(boundary);
  await advance(3000);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  noTokenizationOrPayment();
});

it('rejects a stale native Add Card handler during the confirmed-selection animation', async () => {
  startNativeCardTokenization.mockReturnValue({ promise: new Promise(() => {}), cancel: jest.fn() });
  await open();
  const staleAddCard = screen().onSelectMethod;
  await confirm();
  expect(screen().selectionStatus).toBe('confirmed');
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

it.each(['outlet', 'reopen'])('replaces the order snapshot and clears old add feedback on a new %s context', async boundary => {
  const firstOrder = {
    action: 'VERIFY', amount: { currencyCode: 'AED', value: 100 },
    paymentMethods: { card: ['VISA'], wallet: [] },
  };
  const nextOrder = {
    action: 'VERIFY', amount: { currencyCode: 'USD', value: 200 },
    paymentMethods: { card: [], wallet: ['GOOGLE_PAY'] },
  };
  native.isGooglePaySupported.mockResolvedValueOnce(true);
  if (boundary === 'reopen') native.isGooglePaySupported.mockResolvedValueOnce(true);
  native.initiateGooglePay.mockResolvedValueOnce({ token: 'fixture-encrypted-wallet' });
  startNativeCardTokenization
    .mockReturnValueOnce({ promise: Promise.resolve({ state: 'SUCCESS', updatedTokenList: { tokens: [{ ...card, tokenRef: 'added-card' }] } }), cancel: jest.fn() })
    .mockReturnValueOnce({ promise: Promise.resolve({ state: 'FAILED', result: { status: 'FAILED' } }), cancel: jest.fn() });
  const client = defaultClient();
  client.addWallet.mockResolvedValue({ tokens: [{ ...card, type: 'WALLET', walletType: 'GOOGLE_PAY' }] });
  await open({ order: firstOrder, tokenizationClient: client });
  expect(screen().methods).toEqual(['CARD']);
  expect(screen().orderSummary.amount).toMatchObject({ currencyCode: 'AED', formattedValue: '1.00' });
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(screen().tokenSaved).toBe(true);
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(screen().status).toBe('FAILED');
  expect(screen().errorMessage).toBeTruthy();

  // Ordinary order prop updates keep the active session's original snapshot.
  await update({ order: nextOrder });
  expect(screen().methods).toEqual(['CARD']);
  expect(screen().orderSummary.amount).toMatchObject({ currencyCode: 'AED', formattedValue: '1.00' });
  expect(screen().tokenSaved).toBe(true);
  expect(screen().status).toBe('FAILED');

  if (boundary === 'reopen') {
    await update({ visible: false });
    await update({ visible: true });
  } else await update({ outletRef: 'outlet-2' });
  expect(screen().status).toBe('READY');
  expect(screen().tokenSaved).toBe(false);
  expect(screen().errorMessage).toBeUndefined();
  expect(screen().methods).toEqual(['GOOGLE_PAY']);
  expect(screen().orderSummary.amount).toMatchObject({ currencyCode: 'USD', formattedValue: '2.00' });
  await act(async () => { screen().onSelectMethod('GOOGLE_PAY'); await flush(); });
  expect(native.initiateGooglePay).toHaveBeenCalledWith({
    ...nextOrder, amount: { ...nextOrder.amount, value: 0, formattedValue: '0.00' },
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

it('retries failed initial Get with the replacement client and the same sessionRef', async () => {
  const expired = defaultClient();
  expired.getSession.mockRejectedValue(new Error('expired access token'));
  const replacement = defaultClient();
  await open({ tokenizationClient: expired });
  expect(screen().savedTokens.failed).toBe(true);

  await update({ tokenizationClient: replacement });
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
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

it('uses the explicit ONCE_OFF type for Add Card and leaves a new card unselected', async () => {
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
  expect(screen().selectedTokenRef).toBeNull();
  expect(client.selectToken).not.toHaveBeenCalled();
});
