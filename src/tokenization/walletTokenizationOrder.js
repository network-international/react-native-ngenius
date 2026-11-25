const { normalizeOrderMoney } = require('./orderDetails');
const { TokenizationApiError } = require('./api/errors');

// Capture uses zero in the current Get Session currency. Caller context may
// provide non-monetary details, but cannot supply a payment amount or currency.
const walletTokenizationOrder = (order, sessionAmount) => {
  const money = normalizeOrderMoney({ currencyCode: sessionAmount?.currencyCode, value: 0 });
  if (!money) {
    throw new TokenizationApiError({
      status: 0,
      code: 'INVALID_WALLET_REQUEST',
      message: 'A valid session currency is required for wallet capture',
    });
  }
  const { amount, orderSummary, ...context } = order || {};
  return {
    ...context,
    amount: { currencyCode: money.currencyCode, value: 0, formattedValue: money.formattedValue },
  };
};
module.exports = { walletTokenizationOrder };
