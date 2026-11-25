const { paymentFailure, paymentSuccess, paymentCancellation, newVerifiedTokenRef } = require('../paymentOutcome');

const card = (tokenRef, status = 'VERIFIED') => ({
  tokenRef,
  status,
  type: 'CARD',
  cardDetails: { scheme: 'VISA', last4: '1111', expiry: '2099-12' },
});

const wallet = (tokenRef, walletType) => ({ ...card(tokenRef), type: 'WALLET', walletType });

it('distinguishes authentication failures before and after initialization without passing upstream details', () => {
  const error = { status: 401, message: 'private credential or service response' };
  expect(paymentFailure({ stage: 'initialize', error, sessionID: 'session-1' })).toEqual({
    result: { statusCode: 401, message: 'Cannot initialize SDK: authentication failed.' },
    messageKey: 'PAYMENT_INITIALIZATION_FAILED',
    retryable: false,
  });
  for (const stage of ['refresh', 'add', 'select']) {
    expect(paymentFailure({ stage, error, sessionID: 'session-1' })).toEqual({
      result: { statusCode: 402, message: 'Payment session expired. Start a new checkout session.', sessionID: 'session-1' },
      messageKey: 'PAYMENT_SESSION_EXPIRED',
      retryable: false,
    });
  }
});

it('keeps retryable verification and connection failures distinct from an unavailable session', () => {
  expect(paymentFailure({ stage: 'add', error: { httpStatus: 422 } })).toMatchObject({
    result: { statusCode: 422 }, retryable: true, messageKey: 'PAYMENT_METHOD_ADD_FAILED',
  });
  expect(paymentFailure({ stage: 'initialize', error: { code: 'NETWORK_ERROR' } })).toMatchObject({
    result: { statusCode: 503 }, retryable: true, messageKey: 'PAYMENT_NETWORK_ERROR',
  });
  expect(paymentFailure({ stage: 'refresh', error: { status: 502 }, sessionID: 'session-1' })).toEqual({
    result: { statusCode: 502, message: 'Could not load payment methods.', sessionID: 'session-1' },
    retryable: true,
    messageKey: 'IMPORTED_METHODS_ERROR',
  });
  expect(paymentFailure({ stage: 'initialize', error: { status: 404 }, sessionID: 'session-1' })).toEqual({
    result: { statusCode: 404, message: 'Cannot initialize SDK: the outlet or session is unavailable.' },
    retryable: false,
    messageKey: 'PAYMENT_SESSION_UNAVAILABLE',
  });
});

it.each(['initialize', 'refresh', 'select', 'add'])('ends a timed-out %s safely without suggesting a repeated mutation', stage => {
  for (const error of [
    { code: 'REQUEST_TIMEOUT', message: 'private upstream detail' },
    { status: 408 },
    { httpStatus: 504 },
  ]) {
    const failure = paymentFailure({ stage, error, sessionID: 'session-1' });
    expect(failure).toEqual({
      result: {
        statusCode: 408,
        message: stage === 'initialize'
          ? 'Cannot initialize SDK: request timed out.'
          : 'Request timed out. Check the session status before retrying.',
        ...(stage === 'initialize' ? {} : { sessionID: 'session-1' }),
      },
      messageKey: 'PAYMENT_REQUEST_TIMEOUT',
      retryable: false,
    });
    expect(JSON.stringify(failure)).not.toContain('private');
  }
});

it('reports a confirmed method separately from explicit dismissal and omits an invalid session reference', () => {
  expect(paymentSuccess('session-1')).toEqual({ statusCode: 200, message: 'Payment method confirmed.', sessionID: 'session-1' });
  expect(paymentCancellation('session-1', 'swipe')).toEqual({
    statusCode: 499, message: 'Checkout dismissed by swiping down.', sessionID: 'session-1',
  });
  expect(paymentCancellation('bad/reference', 'constructor')).toEqual({ statusCode: 499, message: 'Checkout cancelled by the shopper.' });
});

it('identifies only a uniquely new verified token for the method that was submitted', () => {
  const existing = card('existing');
  const added = card('added');
  expect(newVerifiedTokenRef([existing], [added, existing], 'CARD')).toBe('added');
  expect(newVerifiedTokenRef([existing], [existing, card('new', 'FAILED')], 'CARD')).toBeNull();
  expect(newVerifiedTokenRef([existing], [existing, card('new', 'AWAIT_3DS')], 'CARD')).toBeNull();
  expect(newVerifiedTokenRef([card('added', 'AWAIT_3DS')], [added], 'CARD')).toBeNull();
  expect(newVerifiedTokenRef([existing], [existing, wallet('added', 'APPLE_PAY')], 'GOOGLE_PAY')).toBeNull();
  expect(newVerifiedTokenRef([existing], [existing, wallet('added', 'APPLE_PAY')], 'APPLE_PAY')).toBe('added');
});

it('declines ambiguous, duplicate or partial lists rather than choosing another method', () => {
  const existing = card('existing');
  const added = card('added');
  expect(newVerifiedTokenRef([existing], [existing, added, card('other', 'FAILED')], 'CARD')).toBeNull();
  expect(newVerifiedTokenRef([existing], [existing, added, added], 'CARD')).toBeNull();
  expect(newVerifiedTokenRef([existing], [existing, added, wallet('unrelated', 'GOOGLE_PAY')], 'CARD')).toBeNull();
  const incomplete = { number: 0, size: 1, totalElements: 2, totalPages: 2 };
  expect(newVerifiedTokenRef([existing], [existing, added], 'CARD', { previousPage: incomplete })).toBeNull();
  expect(newVerifiedTokenRef([existing], [added], 'CARD', { updatedPage: incomplete })).toBeNull();
});
