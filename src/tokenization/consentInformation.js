const { supportedTermsUrl } = require('./termsUrl');

const resolveConsentInformation = ({ consentOff, order, tncUrl } = {}) => {
  if (consentOff === true) return null;
  const url = supportedTermsUrl(tncUrl);
  const diagnostic = url ? undefined :
    tncUrl == null || (typeof tncUrl === 'string' && !tncUrl.trim())
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

  return { key, url, diagnostic };
};

const loadTncUrl = async ({ client, outletRef, consentOff }) => {
  if (consentOff === true || !client || !outletRef) return undefined;
  try {
    const { tncUrl } = await client.getSavedTokens({ outletRef });
    return tncUrl;
  } catch (error) {
    return undefined;
  }
};

module.exports = { resolveConsentInformation, loadTncUrl };
