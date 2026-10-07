// Source: paypage-app-2 TnC and getOrderType, origin/master 1d37b89b.
// Backend owns precedence; its final response container is not yet defined.
const { supportedTermsUrl } = require('./termsUrl');

const resolveConsentInformation = ({ consentOff, order, bootstrap } = {}) => {
  if (consentOff === true) return null;
  const value = bootstrap && bootstrap.resolvedTncUrl;
  const url = supportedTermsUrl(value);
  const diagnostic = url ? undefined :
    value == null || (typeof value === 'string' && !value.trim())
      ? 'TERMS_URL_MISSING' : 'TERMS_URL_INVALID';

  let key;
  if (order && order.isSaudiPaymentEnabled !== true) {
    if (order.type === 'UNSCHEDULED') {
      key = 'UNSCHEDULED_TERMS_AND_CONDITIONS';
    } else if (order.merchantAttributes && order.merchantAttributes.paymentModel === 'subscription') {
      if (order.type === 'RECURRING') key = 'SUBSCRIPTION_TERMS_AND_CONDITIONS';
      if (order.type === 'INSTALLMENT') key = 'INSTALLMENT_TERMS_AND_CONDITIONS';
    }
  }

  // TnC has no action/VERIFY branch and interpolates no amounts or MCP values.
  return { key, url, diagnostic };
};

module.exports = { resolveConsentInformation };
