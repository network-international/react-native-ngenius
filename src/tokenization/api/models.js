const CARD_SCHEMES = [
  'VISA',
  'MASTERCARD',
  'AMEX',
  'DINERS',
  'JCB',
  'UNIONPAY',
];

const WALLET_SCHEMES = ['VISA', 'MASTERCARD', 'AMEX'];
const WALLET_TYPES = ['APPLE_PAY', 'GOOGLE_PAY'];
const PAYMENT_METHOD_TYPES = ['CARD', 'WALLET'];
const PAYMENT_METHOD_STATUSES = ['ACTIVE', 'DELETED', 'EXPIRED'];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAST4_PATTERN = /^[0-9]{4}$/;
const EXPIRY_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const PAN_PATTERN = /^[0-9]{13,19}$/;
const CVV_PATTERN = /^[0-9]{3,4}$/;

const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

const optionalString = (value) =>
  typeof value === 'string' && value.length > 0 ? value : null;

const parsePaymentMethodResponse = (value) => {
  if (!value || typeof value !== 'object') {
    throw new Error('PaymentMethodResponse is missing');
  }
  const tokenRef = value.tokenRef;
  const type = value.type;
  const scheme = value.scheme;
  const last4digits = value.last4digits;
  const status = value.status;
  if (!isUuid(tokenRef)) {
    throw new Error('PaymentMethodResponse.tokenRef is invalid');
  }
  if (PAYMENT_METHOD_TYPES.indexOf(type) === -1) {
    throw new Error('PaymentMethodResponse.type is invalid');
  }
  if (CARD_SCHEMES.indexOf(scheme) === -1) {
    throw new Error('PaymentMethodResponse.scheme is invalid');
  }
  if (typeof last4digits !== 'string' || !LAST4_PATTERN.test(last4digits)) {
    throw new Error('PaymentMethodResponse.last4digits is invalid');
  }
  if (PAYMENT_METHOD_STATUSES.indexOf(status) === -1) {
    throw new Error('PaymentMethodResponse.status is invalid');
  }
  let walletType = null;
  if (value.walletType != null) {
    if (WALLET_TYPES.indexOf(value.walletType) === -1) {
      throw new Error('PaymentMethodResponse.walletType is invalid');
    }
    walletType = value.walletType;
  }
  let expiry = null;
  if (value.expiry != null) {
    if (typeof value.expiry !== 'string' || !EXPIRY_PATTERN.test(value.expiry)) {
      throw new Error('PaymentMethodResponse.expiry is invalid');
    }
    expiry = value.expiry;
  }
  return {
    tokenRef,
    type,
    scheme,
    walletType,
    last4digits,
    expiry,
    status,
  };
};

const parsePaymentMethodListResponse = (value) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.paymentMethods)) {
    throw new Error('PaymentMethodListResponse is invalid');
  }
  return {
    paymentMethods: value.paymentMethods.map(parsePaymentMethodResponse),
  };
};

const parseValidatePaymentMethodResponse = (value) => {
  if (!value || typeof value !== 'object' || typeof value.valid !== 'boolean') {
    throw new Error('ValidatePaymentMethodResponse is invalid');
  }
  const method = parsePaymentMethodResponse(value);
  return {
    valid: value.valid,
    ...method,
  };
};

const optionalOrderContext = (order) => {
  if (order && typeof order === 'object' && !Array.isArray(order)) {
    return order;
  }
  return undefined;
};

const mapCreateCardRequest = (input) => {
  if (!input || typeof input !== 'object') {
    throw new Error('CreateCardRequest is required');
  }
  const pan = input.pan;
  const expiry = input.expiry;
  const cvv = input.cvv;
  const scheme = input.scheme;
  if (typeof pan !== 'string' || !PAN_PATTERN.test(pan)) {
    throw new Error('CreateCardRequest.pan is invalid');
  }
  if (typeof expiry !== 'string' || !EXPIRY_PATTERN.test(expiry)) {
    throw new Error('CreateCardRequest.expiry is invalid');
  }
  if (typeof cvv !== 'string' || !CVV_PATTERN.test(cvv)) {
    throw new Error('CreateCardRequest.cvv is invalid');
  }
  if (CARD_SCHEMES.indexOf(scheme) === -1) {
    throw new Error('CreateCardRequest.scheme is invalid');
  }
  const body = { pan, expiry, cvv, scheme };
  const cardholderName = optionalString(input.cardholderName);
  if (cardholderName) {
    body.cardholderName = cardholderName;
  }
  const order = optionalOrderContext(input.order);
  if (order) {
    body.order = order;
  }
  return body;
};

const mapCreateWalletRequest = (input) => {
  if (!input || typeof input !== 'object') {
    throw new Error('CreateWalletRequest is required');
  }
  const walletType = input.walletType;
  const dan = input.dan;
  const onlinePaymentCryptogram = input.onlinePaymentCryptogram;
  const expiry = input.expiry;
  const scheme = input.scheme;
  if (WALLET_TYPES.indexOf(walletType) === -1) {
    throw new Error('CreateWalletRequest.walletType is invalid');
  }
  if (typeof dan !== 'string' || dan.length === 0) {
    throw new Error('CreateWalletRequest.dan is invalid');
  }
  if (
    typeof onlinePaymentCryptogram !== 'string' ||
    onlinePaymentCryptogram.length === 0
  ) {
    throw new Error('CreateWalletRequest.onlinePaymentCryptogram is invalid');
  }
  if (typeof expiry !== 'string' || !EXPIRY_PATTERN.test(expiry)) {
    throw new Error('CreateWalletRequest.expiry is invalid');
  }
  if (WALLET_SCHEMES.indexOf(scheme) === -1) {
    throw new Error('CreateWalletRequest.scheme is invalid');
  }
  const body = {
    walletType,
    dan,
    onlinePaymentCryptogram,
    expiry,
    scheme,
  };
  if (optionalString(input.eciIndicator)) {
    body.eciIndicator = input.eciIndicator;
  }
  if (optionalString(input.message)) {
    body.message = input.message;
  }
  const order = optionalOrderContext(input.order);
  if (order) {
    body.order = order;
  }
  return body;
};

module.exports = {
  CARD_SCHEMES,
  WALLET_SCHEMES,
  WALLET_TYPES,
  PAYMENT_METHOD_TYPES,
  PAYMENT_METHOD_STATUSES,
  UUID_PATTERN,
  isUuid,
  parsePaymentMethodResponse,
  parsePaymentMethodListResponse,
  parseValidatePaymentMethodResponse,
  optionalOrderContext,
  mapCreateCardRequest,
  mapCreateWalletRequest,
};
