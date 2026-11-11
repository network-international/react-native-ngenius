const { validReference } = require('./api/endpoints');
const { savedPaymentMethodSelection } = require('./savedPaymentMethodSelection');

const httpStatusOf = error => {
  const status = typeof error?.httpStatus === 'number' ? error.httpStatus : error?.status;
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
};

const merchantResult = (statusCode, message, sessionID) => ({
  statusCode,
  message,
  ...(validReference(sessionID) ? { sessionID } : {}),
});

const paymentSuccess = sessionID => merchantResult(200, 'Payment method confirmed.', sessionID);

const dismissalMessages = {
  backdrop: 'Checkout dismissed by tapping outside the payment methods.',
  swipe: 'Checkout dismissed by swiping down.',
  host: 'Checkout closed by the merchant app.',
  continueShopping: 'Shopper returned to the merchant app.',
};

const paymentCancellation = (sessionID, reason) => merchantResult(
  499,
  Object.prototype.hasOwnProperty.call(dismissalMessages, reason)
    ? dismissalMessages[reason]
    : 'Checkout cancelled by the shopper.',
  sessionID,
);

const paymentFailure = ({ stage, error, sessionID }) => {
  const initializing = stage === 'initialize';
  const status = httpStatusOf(error);
  const code = error?.code;
  const failure = (statusCode, message, messageKey, retryable = false) => ({
    result: merchantResult(statusCode, message, initializing ? undefined : sessionID),
    messageKey,
    retryable,
  });

  if (status === 401 || status === 402 || status === 410 ||
      code === 'UNAUTHORIZED' || code === 'ACCESS_TOKEN_UNAVAILABLE') {
    return initializing
      ? failure(401, 'Cannot initialize SDK: authentication failed.', 'PAYMENT_INITIALIZATION_FAILED')
      : failure(402, 'Payment session expired. Start a new checkout session.', 'PAYMENT_SESSION_EXPIRED');
  }

  if (status === 403 || status === 404 || code === 'INVALID_OUTLET_REF' || code === 'INVALID_SESSION_REF') {
    const statusCode = status === 403 ? 403 : 404;
    return failure(
      statusCode,
      initializing ? 'Cannot initialize SDK: the outlet or session is unavailable.' : 'The payment session is unavailable.',
      'PAYMENT_SESSION_UNAVAILABLE',
    );
  }

  if (code === 'NETWORK_ERROR') {
    return failure(
      503,
      initializing ? 'Cannot initialize SDK: connection failed.' : 'Could not reach the tokenization service.',
      'PAYMENT_NETWORK_ERROR',
      true,
    );
  }

  if (initializing) {
    const statusCode = status || (code === 'INVALID_CONFIGURATION' ? 400 : 500);
    return failure(statusCode, 'Cannot initialize SDK.', 'PAYMENT_INITIALIZATION_FAILED', statusCode >= 500 && code !== 'MALFORMED_RESPONSE');
  }

  if (stage === 'refresh') {
    return failure(status || 500, 'Could not load payment methods.', 'IMPORTED_METHODS_ERROR', true);
  }

  if (stage === 'select') {
    return failure(status || 500, 'Payment method could not be confirmed.', 'PAYMENT_METHOD_SELECTION_FAILED', true);
  }

  if (code === 'ADD_WALLET_BACKEND_PENDING') {
    return failure(501, 'Wallet tokenization is unavailable.', 'PAYMENT_METHOD_ADD_FAILED', true);
  }

  return failure(status || 422, 'Payment method could not be added.', 'PAYMENT_METHOD_ADD_FAILED', true);
};

// The Add response contains a list, not the reference of the created method.
// Reject ambiguous changes and partial lists instead of choosing a different method.
const completeList = (tokens, page) => !page || (
  page.number === 0 && page.totalPages <= 1 && page.totalElements <= tokens.length
);

const newVerifiedTokenRef = (previousTokens, updatedTokens, method, { previousPage, updatedPage } = {}) => {
  if (!Array.isArray(previousTokens) || !Array.isArray(updatedTokens) ||
      !completeList(previousTokens, previousPage) || !completeList(updatedTokens, updatedPage)) {
    return null;
  }

  const previousRefs = new Set(previousTokens.map(token => token?.tokenRef));
  const updatedRefs = new Set(updatedTokens.map(token => token?.tokenRef));
  if (previousRefs.size !== previousTokens.length || updatedRefs.size !== updatedTokens.length ||
      [...previousRefs, ...updatedRefs].some(ref => !validReference(ref))) {
    return null;
  }

  const added = updatedTokens.filter(token => !previousRefs.has(token.tokenRef));
  if (added.length !== 1) return null;
  const [token] = added;
  const matchesMethod = method === 'CARD' ? token.type === 'CARD' : (
    (method === 'APPLE_PAY' || method === 'GOOGLE_PAY') && token.type === 'WALLET' && token.walletType === method
  );
  return matchesMethod && savedPaymentMethodSelection(updatedTokens, token.tokenRef) ? token.tokenRef : null;
};

module.exports = { paymentFailure, paymentSuccess, paymentCancellation, newVerifiedTokenRef, httpStatusOf };
