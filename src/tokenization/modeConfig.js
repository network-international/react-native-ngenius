const { t } = require('./strings');
const { supportedTermsUrl } = require('./termsUrl');

const LABEL_KEYS = [
  'pageTitle', 'pageSubtitle', 'savedMethodsTitle', 'addMethodTitle', 'addCard',
  'addAnotherCard', 'usePaymentMethod', 'selectionPending',
  'selectionSuccessTitle', 'selectionSuccessMessage', 'selectionError',
  'orderSummary', 'orderItems', 'orderAmount', 'orderShipping', 'orderTax', 'orderTotal',
];
const plainLabel = value =>
  typeof value === 'string' && value.trim() && value.trim().length <= 200 &&
  !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : undefined;

const resolveModeConfig = (value, language = 'en') => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const labels = {};
  const input = source.labels && typeof source.labels === 'object' ? source.labels : {};
  LABEL_KEYS.forEach(key => {
    const label = plainLabel(input[key]);
    if (label) labels[key] = label;
  });
  return {
    returnButtonName: plainLabel(source.returnButtonName) || t(language, 'CONTINUE_SHOPPING'),
    returnButtonStyle: ['text', 'link', 'button'].includes(source.returnButtonStyle) ? source.returnButtonStyle : 'button',
    showSecurityNote: source.showSecurityNote !== false,
    orderSummaryInitiallyExpanded: source.orderSummaryInitiallyExpanded === true,
    ...(supportedTermsUrl(source.privacyPolicyUrl) ? { privacyPolicyUrl: supportedTermsUrl(source.privacyPolicyUrl) } : {}),
    labels,
  };
};

module.exports = { resolveModeConfig };
