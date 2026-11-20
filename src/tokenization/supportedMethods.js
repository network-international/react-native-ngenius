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

const hasCardMethods = (paymentMethods) => {
  if (!paymentMethods) {
    return true;
  }
  if (!Array.isArray(paymentMethods.card)) {
    return true;
  }
  return paymentMethods.card.length > 0;
};

const walletIncludes = (paymentMethods, wallet) => {
  const wallets = paymentMethods && Array.isArray(paymentMethods.wallet) ? paymentMethods.wallet : [];
  return wallets.includes(wallet);
};

const getTokenizationMethods = (order, options = {}) => {
  const {
    platform,
    applePaySupported = false,
    googlePaySupported = false,
  } = options;
  if (options.paymentMethods !== undefined) {
    const requested = Array.isArray(options.paymentMethods) ? options.paymentMethods : [];
    return TOKENIZATION_SUPPORTED_METHODS.filter((method) => requested.includes(method) && (
      method === 'CARD' ||
      (method === 'APPLE_PAY' && platform === 'ios' && applePaySupported) ||
      (method === 'GOOGLE_PAY' && platform === 'android' && googlePaySupported)
    ));
  }
  const paymentMethods = order && order.paymentMethods;
  const methods = [];

  if (hasCardMethods(paymentMethods)) {
    methods.push('CARD');
  }

  if (platform === 'ios' && applePaySupported) {
    if (!paymentMethods || !Array.isArray(paymentMethods.wallet) || walletIncludes(paymentMethods, 'APPLE_PAY')) {
      methods.push('APPLE_PAY');
    }
  }

  if (platform === 'android' && googlePaySupported) {
    if (!paymentMethods || !Array.isArray(paymentMethods.wallet) || walletIncludes(paymentMethods, 'GOOGLE_PAY')) {
      methods.push('GOOGLE_PAY');
    }
  }

  return methods.filter((method) => TOKENIZATION_SUPPORTED_METHODS.includes(method));
};

const isTokenizationMethodSupported = (method) =>
  TOKENIZATION_SUPPORTED_METHODS.includes(method);

module.exports = {
  TOKENIZATION_SUPPORTED_METHODS,
  EXCLUDED_TOKENIZATION_METHODS,
  getTokenizationMethods,
  isTokenizationMethodSupported,
};
