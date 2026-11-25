const TOKENIZATION_SUPPORTED_METHODS = Object.freeze(['CARD', 'APPLE_PAY', 'GOOGLE_PAY']);

const EXCLUDED_TOKENIZATION_METHODS = Object.freeze([
  'SAMSUNG_PAY',
  'TABBY',
  'TAMARA',
  'AANI',
  'CHINA_UNION_PAY',
  'CUP',
  'QPAY',
  'CLICK_TO_PAY',
]);

// A Get Session response without paymentMethods keeps the card form available.
// Once paymentMethods is supplied, only the listed methods are offered: a missing
// list, an empty list and a malformed list all mean "not allowed".
const sessionAllows = (sessionPaymentMethods, method) => {
  if (sessionPaymentMethods == null) {
    return method === 'CARD';
  }
  const list = sessionPaymentMethods[method === 'CARD' ? 'card' : 'wallet'];
  if (!Array.isArray(list)) {
    return false;
  }
  return method === 'CARD' ? list.length > 0 : list.includes(method);
};

const walletReady = (method, options) => options.walletTokenizationAvailable === true && (
  (method === 'APPLE_PAY' && options.platform === 'ios' && options.applePaySupported === true) ||
  (method === 'GOOGLE_PAY' && options.platform === 'android' && options.googlePaySupported === true)
);

// Compatibility: CONTINUE_SHOPPING is a UI option carried by the legacy paymentMethods
// prop. A prop that lists only CONTINUE_SHOPPING shows the return action without
// narrowing the session methods.
const UI_ONLY_ENTRIES = Object.freeze(['CONTINUE_SHOPPING']);
const narrowsMethods = requested => requested !== undefined && !(
  Array.isArray(requested) && requested.length > 0 &&
  requested.every(entry => UI_ONLY_ENTRIES.includes(entry))
);

// The merchant's paymentMethods prop can only narrow what the session allows.
const getTokenizationMethods = (sessionPaymentMethods, options = {}) => {
  const requested = options.paymentMethods;
  const narrowed = narrowsMethods(requested);
  return TOKENIZATION_SUPPORTED_METHODS.filter(method =>
    sessionAllows(sessionPaymentMethods, method) &&
    (!narrowed || (Array.isArray(requested) && requested.includes(method))) &&
    (method === 'CARD' || walletReady(method, options)));
};

const isTokenizationMethodSupported = (method) =>
  TOKENIZATION_SUPPORTED_METHODS.includes(method);

module.exports = {
  TOKENIZATION_SUPPORTED_METHODS,
  EXCLUDED_TOKENIZATION_METHODS,
  getTokenizationMethods,
  isTokenizationMethodSupported,
};
