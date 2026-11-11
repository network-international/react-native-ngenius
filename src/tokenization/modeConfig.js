const { UsageType } = require('./usageType');
const { t } = require('./strings');
const { supportedTermsUrl } = require('./termsUrl');
const DEFAULT_SECTION_ORDER = Object.freeze(['tokens', 'wallets', 'card']);

const LABEL_KEYS = [
  'pageTitle', 'pageSubtitle', 'savedMethodsTitle', 'payByCard', 'pay',
  'addCard', 'addAnotherCard', 'usePaymentMethod', 'selectionPending',
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
  const requestedOrder = Array.isArray(source.sectionOrder) ? source.sectionOrder : [];
  const sectionOrder = [...new Set([...requestedOrder, ...DEFAULT_SECTION_ORDER]
    .filter(section => DEFAULT_SECTION_ORDER.includes(section)))];
  return {
    tokenType: source.tokenType === undefined ? UsageType.PERMANENT : source.tokenType,
    returnButtonName: plainLabel(source.returnButtonName) || t(language, 'CONTINUE_SHOPPING'),
    returnButtonStyle: ['text', 'link', 'button'].includes(source.returnButtonStyle) ? source.returnButtonStyle : 'button',
    showSecurityNote: source.showSecurityNote === true,
    presentation: source.presentation === 'fullscreen' ? 'fullscreen' : 'bottomSheet',
    backdropBlur: source.backdropBlur === true,
    sectionOrder,
    orderSummaryInitiallyExpanded: source.orderSummaryInitiallyExpanded === true,
    ...(supportedTermsUrl(source.privacyPolicyUrl) ? { privacyPolicyUrl: supportedTermsUrl(source.privacyPolicyUrl) } : {}),
    labels,
  };
};

module.exports = { resolveModeConfig, DEFAULT_SECTION_ORDER };
