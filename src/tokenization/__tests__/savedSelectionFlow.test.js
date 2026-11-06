jest.mock('react-native', () => ({
  Modal: 'Modal', Platform: { OS: 'android', Version: 35 },
  Dimensions: { get: () => ({ width: 412, height: 915 }) },
}));
jest.mock('../ui/TokenizationScreen', () => 'TokenizationScreen');
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
let tree, props;
const screen = () => tree.root.findByType('TokenizationScreen').props;
const modal = () => tree.root.findByType('Modal').props;
const defaultClient = () => ({
  getSavedTokens: jest.fn().mockResolvedValue({ tokens: [card, other], tncUrl: 'https://merchant.test/terms' }),
  selectSessionToken: jest.fn().mockResolvedValue({ status: 'SELECTED' }),
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
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('selects the first eligible imported method on each new launch, without submitting it', async () => {
  const client = defaultClient();
  client.getSavedTokens.mockResolvedValue({ tokens: [
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
  expect(client.selectSessionToken).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
});

it('retains a manual choice across refresh and native Card Back', async () => {
  const back = deferred();
  startNativeCardTokenization.mockReturnValue({ promise: back.promise, cancel: jest.fn() });
  const client = defaultClient();
  client.getSavedTokens.mockResolvedValueOnce({ tokens: [card, other] }).mockResolvedValue({ tokens: [other, card] });
  await open({ tokenizationClient: client });
  act(() => screen().onSelectToken(other.tokenRef));
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  expect(screen().selectedTokenRef).toBe(other.tokenRef);
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).toHaveBeenCalledTimes(1);
  await act(async () => { back.resolve({ state: 'READY' }); await flush(); });
  expect(screen().selectedTokenRef).toBe(other.tokenRef);
  expect(client.selectSessionToken).not.toHaveBeenCalled();
  expect(props.onCancel).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
});

it('refreshes after a newly VERIFIED Card in session mode without returning card metadata or completing selection', async () => {
  const creation = deferred();
  const newCard = { ...other, tokenRef: 'f4b9c12c-4d68-4c7d-b7d7-950c644b0099' };
  startNativeCardTokenization.mockReturnValue({ promise: creation.promise, cancel: jest.fn() });
  const client = defaultClient();
  client.getSavedTokens.mockResolvedValueOnce({ tokens: [card] })
    .mockResolvedValue({ tokens: [card, newCard] });
  await open({ tokenizationClient: client });
  await act(async () => { screen().onSelectMethod('CARD'); await flush(); });
  expect(startNativeCardTokenization).toHaveBeenCalledTimes(1);
  await act(async () => {
    creation.resolve({
      state: 'SUCCESS',
      result: {
        flow: 'TOKENIZATION', method: 'CARD', status: 'VERIFIED',
        niTokenCreated: true, savedToken: newCard, capture: 'REAL_TOKENIZATION_API',
      },
    });
    await flush();
  });
  expect(client.getSavedTokens).toHaveBeenCalledTimes(2);
  expect(screen().savedTokens.tokens).toEqual([card, newCard]);
  expect(screen().status).toBe('READY');
  expect(screen().tokenSaved).toBe(true);
  expect(screen().selectionStatus).toBe('idle');
  expect(modal().visible).toBe(true);
  expect(client.selectSessionToken).not.toHaveBeenCalled();
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  noTokenizationOrPayment();
  act(() => screen().onSelectToken(newCard.tokenRef));
  await confirm();
  expect(client.selectSessionToken).toHaveBeenCalledWith({
    outletRef: 'outlet', sessionRef: 'session-1', selectedToken: newCard.tokenRef,
  });
  expect(screen().selectionStatus).toBe('confirmed');
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  await advance(1100);
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
  expect(props.onSelectionComplete).toHaveBeenCalledWith({ flow: 'TOKENIZATION', status: 'SELECTED', canClose: true });
  expect(JSON.stringify(props.onSelectionComplete.mock.calls)).not.toMatch(/f4b9c12c|cardDetails|savedToken|selectedToken/);
  noTokenizationOrPayment();
});

it('falls back to the first eligible method if refresh removes the manual choice, and clears an empty list', async () => {
  const client = defaultClient();
  client.getSavedTokens.mockResolvedValueOnce({ tokens: [card, other] })
    .mockResolvedValueOnce({ tokens: [card] }).mockResolvedValue({ tokens: [] });
  await open({ tokenizationClient: client });
  act(() => screen().onSelectToken(other.tokenRef));
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  expect(screen().selectedTokenRef).toBe(card.tokenRef);
  await act(async () => { screen().onRetrySavedTokens(); await flush(); });
  expect(screen().selectedTokenRef).toBeNull();
  await confirm(card.tokenRef);
  expect(client.selectSessionToken).not.toHaveBeenCalled();
});

it('rejects stale confirmations in the same event batch as a manual switch or refresh', async () => {
  const refresh = deferred();
  const client = defaultClient();
  client.getSavedTokens.mockResolvedValueOnce({ tokens: [card, other] }).mockReturnValue(refresh.promise);
  await open({ tokenizationClient: client });
  const oldConfirm = screen().onConfirmSavedToken;
  act(() => { screen().onSelectToken(other.tokenRef); oldConfirm(card.tokenRef); });
  expect(client.selectSessionToken).not.toHaveBeenCalled();
  const currentConfirm = screen().onConfirmSavedToken;
  await act(async () => { screen().onRetrySavedTokens(); currentConfirm(other.tokenRef); await flush(); });
  expect(screen().savedTokens.loading).toBe(true);
  expect(client.selectSessionToken).not.toHaveBeenCalled();
});

it('shows submitting state while persistence is pending, blocks duplicates, and emits no early completion', async () => {
  const selection = deferred();
  const client = defaultClient();
  client.selectSessionToken.mockReturnValue(selection.promise);
  await open({ tokenizationClient: client, skipConsent: false });
  expect(screen().consentAccepted).toBe(false);
  const handler = screen().onConfirmSavedToken;
  await act(async () => { handler(card.tokenRef); handler(card.tokenRef); await flush(); });
  expect(client.selectSessionToken).toHaveBeenCalledTimes(1);
  expect(client.selectSessionToken).toHaveBeenCalledWith({ outletRef: 'outlet', sessionRef: 'session-1', selectedToken: card.tokenRef });
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
  client.selectSessionToken.mockResolvedValue({ status: 'SELECTED', savedToken: card, selectedToken: card.tokenRef });
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
  expect(props.onSelectionComplete).toHaveBeenCalledWith({ flow: 'TOKENIZATION', status: 'SELECTED', canClose: true });
  expect(JSON.stringify(props.onSelectionComplete.mock.calls)).not.toMatch(/8a880dc0|cardDetails|savedToken|selectedToken|1234/);
  await act(async () => { handler(card.tokenRef); await flush(); });
  await advance(5000);
  expect(client.selectSessionToken).toHaveBeenCalledTimes(1);
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
  noTokenizationOrPayment();
});

it('keeps a failed request open for retry or another selection without tokenization callbacks', async () => {
  const client = defaultClient();
  client.selectSessionToken.mockRejectedValueOnce(new Error('private backend response'))
    .mockRejectedValueOnce(new Error('retry failed')).mockResolvedValue({ status: 'SELECTED' });
  await open({ tokenizationClient: client });
  await confirm();
  expect(screen().selectionStatus).toBe('failed');
  expect(screen().selectionError).not.toMatch(/private|backend response/);
  expect(modal().visible).toBe(true);
  await advance(3000);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  await confirm();
  expect(client.selectSessionToken).toHaveBeenCalledTimes(2);
  act(() => screen().onSelectToken(other.tokenRef));
  expect(screen().selectionStatus).toBe('idle');
  expect(screen().selectionError).toBeUndefined();
  await confirm();
  expect(client.selectSessionToken).toHaveBeenLastCalledWith({ outletRef: 'outlet', sessionRef: 'session-1', selectedToken: other.tokenRef });
  await advance(1100);
  expect(props.onSelectionComplete).toHaveBeenCalledTimes(1);
  noTokenizationOrPayment();
});

it.each([undefined, { status: 'VERIFIED' }, { status: 'FAILED' }])('does not treat an unconfirmed adapter result as persistence success (%#)', async response => {
  const client = defaultClient();
  client.selectSessionToken.mockResolvedValue(response);
  await open({ tokenizationClient: client });
  await confirm();
  expect(screen().selectionStatus).toBe('failed');
  expect(modal().visible).toBe(true);
  await advance(1100);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  noTokenizationOrPayment();
});

it.each(['session', 'method'])('shows a configuration error without closing when the %s is missing', async missing => {
  const client = defaultClient();
  if (missing === 'method') delete client.selectSessionToken;
  await open({ tokenizationClient: client, sessionRef: missing === 'session' ? undefined : 'session-1' });
  await confirm();
  expect(screen().selectionStatus).toBe('failed');
  expect(screen().selectionError).toBeTruthy();
  expect(modal().visible).toBe(true);
  if (client.selectSessionToken) expect(client.selectSessionToken).not.toHaveBeenCalled();
  await advance(1100);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  noTokenizationOrPayment();
});

it.each([false, true])('keeps real adapter failure open without exposing response bodies (draft opt-in=%p)', async enabled => {
  const transport = jest.fn(async request => request.method === 'GET'
    ? { status: 200, text: JSON.stringify({ tokens: [card] }) }
    : { status: 409, text: JSON.stringify({ message: `private ${card.tokenRef}` }) });
  const provider = jest.fn(async () => 'fixture-access');
  const client = createTokenizationClient({
    baseUrl: 'https://tokenization.test', transport, getAccessToken: provider,
    enableDraftSessionSelection: enabled,
  });
  jest.spyOn(client, 'addWallet');
  await open({ tokenizationClient: client });
  await confirm();
  expect(screen().selectionStatus).toBe('failed');
  expect(modal().visible).toBe(true);
  expect(transport).toHaveBeenCalledTimes(enabled ? 2 : 1);
  expect(provider).toHaveBeenCalledTimes(enabled ? 2 : 1);
  expect(screen().selectionError).not.toContain(card.tokenRef);
  await advance(1100);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  noTokenizationOrPayment();
});

it('rejects previous-launch row handlers after close/reopen and previous-session handlers after sessionRef changes', async () => {
  await open();
  const oldConfirm = screen().onConfirmSavedToken;
  await update({ visible: false });
  await update({ visible: true });
  await act(async () => { oldConfirm(card.tokenRef); await flush(); });
  expect(props.tokenizationClient.selectSessionToken).not.toHaveBeenCalled();
  const previousSessionConfirm = screen().onConfirmSavedToken;
  await update({ sessionRef: 'session-2' });
  await act(async () => { previousSessionConfirm(card.tokenRef); await flush(); });
  expect(props.tokenizationClient.selectSessionToken).not.toHaveBeenCalled();
  await confirm();
  expect(props.tokenizationClient.selectSessionToken).toHaveBeenCalledWith({ outletRef: 'outlet', sessionRef: 'session-2', selectedToken: card.tokenRef });
});

const invalidate = async boundary => {
  if (boundary === 'unmount') { act(() => tree.unmount()); tree = undefined; }
  else await update(boundary === 'close' ? { visible: false } : { sessionRef: 'session-2' });
};
it.each(['close', 'unmount', 'session change'])('ignores a late successful response after %s', async boundary => {
  const pending = deferred();
  const client = defaultClient();
  client.selectSessionToken.mockReturnValue(pending.promise);
  await open({ tokenizationClient: client });
  await confirm();
  await invalidate(boundary);
  await act(async () => { pending.resolve({ status: 'SELECTED' }); await flush(); });
  await advance(3000);
  expect(props.onSelectionComplete).not.toHaveBeenCalled();
  if (tree) expect(screen().selectionStatus).toBe('idle');
  noTokenizationOrPayment();
});

it.each(['close', 'unmount', 'session change'])('cancels the confirmed-success timer on %s', async boundary => {
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
  await update({ sessionRef: 'session-2', outletRef: 'outlet-2' });
  await act(async () => { staleAddCard('CARD'); await flush(); });
  expect(startNativeCardTokenization).not.toHaveBeenCalled();
});

it.each(['session', 'outlet', 'reopen'])('replaces the order snapshot and clears old add feedback on a new %s context', async boundary => {
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
    .mockReturnValueOnce({ promise: Promise.resolve({ state: 'SUCCESS', result: {} }), cancel: jest.fn() })
    .mockReturnValueOnce({ promise: Promise.resolve({ state: 'FAILED', result: { status: 'FAILED' } }), cancel: jest.fn() });
  const client = defaultClient();
  client.addWallet.mockResolvedValue({ ...card, type: 'WALLET', walletType: 'GOOGLE_PAY' });
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
  } else await update(boundary === 'session' ? { sessionRef: 'session-2' } : { outletRef: 'outlet-2' });
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
