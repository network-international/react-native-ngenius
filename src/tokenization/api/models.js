const { supportedTermsUrl } = require('../termsUrl');
const { REFERENCE_PATTERN } = require('./endpoints');

const TOKEN_TYPES = ['CARD', 'WALLET'];
const WALLET_TYPES = ['APPLE_PAY', 'GOOGLE_PAY'];
const TOKEN_STATUSES = ['VERIFIED', 'AWAIT_3DS', 'FAILED'];
const THREE_DS_COMP_IND = ['Y', 'N', 'U'];

const LAST4_PATTERN = /^[0-9]{4}$/;
const EXPIRY_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

const optionalString = (value, name) => {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${name} is invalid`);
  }
  return value;
};

const parseCardDetails = (value) => {
  if (!value || typeof value !== 'object') {
    throw new Error('SavedCardResponse.cardDetails is invalid');
  }
  if (!isNonEmptyString(value.scheme)) {
    throw new Error('SavedCardResponse.cardDetails.scheme is invalid');
  }
  if (typeof value.last4 !== 'string' || !LAST4_PATTERN.test(value.last4)) {
    throw new Error('SavedCardResponse.cardDetails.last4 is invalid');
  }
  if (typeof value.expiry !== 'string' || !EXPIRY_PATTERN.test(value.expiry)) {
    throw new Error('SavedCardResponse.cardDetails.expiry is invalid');
  }
  const details = {
    scheme: value.scheme,
    last4: value.last4,
    expiry: value.expiry,
  };
  const cardholderName = optionalString(
    value.cardholderName,
    'SavedCardResponse.cardDetails.cardholderName'
  );
  if (cardholderName !== undefined) {
    details.cardholderName = cardholderName;
  }
  return details;
};

const METHOD_FIELDS = [
  'threeDSMethodURL',
  'threeDSServerTransID',
  'threeDSMethodData',
  'threeDSMethodNotificationURL',
  'messageVersion',
];
const CHALLENGE_FIELDS = [
  'threeDSServerTransID',
  'acsTransID',
  'acsURL',
  'base64EncodedCReq',
  'transStatus',
  'messageVersion',
];

const copyStrings = (source, fields) => {
  const out = {};
  fields.forEach((field) => {
    const value = optionalString(source[field], `SavedCardResponse.3ds2.${field}`);
    if (value !== undefined) {
      out[field] = value;
    }
  });
  return out;
};

const parseThreeDS2 = (value) => {
  if (!value || typeof value !== 'object') {
    throw new Error('SavedCardResponse.3ds2 is invalid');
  }
  if (isNonEmptyString(value.acsURL) || isNonEmptyString(value.base64EncodedCReq)) {
    if (!isNonEmptyString(value.acsURL) || !isNonEmptyString(value.base64EncodedCReq)) {
      throw new Error('SavedCardResponse.3ds2 challenge data is incomplete');
    }
    return { step: 'CHALLENGE', ...copyStrings(value, CHALLENGE_FIELDS) };
  }
  if (!isNonEmptyString(value.threeDSServerTransID)) {
    throw new Error('SavedCardResponse.3ds2.threeDSServerTransID is invalid');
  }
  const method = copyStrings(value, METHOD_FIELDS);
  if (method.threeDSMethodURL && !method.threeDSMethodData) {
    throw new Error('SavedCardResponse.3ds2.threeDSMethodData is invalid');
  }
  return { step: 'METHOD', ...method };
};

// Saved-token lists can omit continuation data; verification responses need it.
const parseSavedCardResponse = (value, { requireContinuation = false } = {}) => {
  if (!value || typeof value !== 'object') {
    throw new Error('SavedCardResponse is missing');
  }
  const { tokenRef, type, status } = value;
  if (typeof tokenRef !== 'string' || !REFERENCE_PATTERN.test(tokenRef)) {
    throw new Error('SavedCardResponse.tokenRef is invalid');
  }
  if (TOKEN_TYPES.indexOf(type) === -1) {
    throw new Error('SavedCardResponse.type is invalid');
  }
  if (TOKEN_STATUSES.indexOf(status) === -1) {
    throw new Error('SavedCardResponse.status is invalid');
  }
  let walletType = null;
  if (type === 'WALLET') {
    if (WALLET_TYPES.indexOf(value.walletType) === -1) {
      throw new Error('SavedCardResponse.walletType is invalid');
    }
    walletType = value.walletType;
  } else if (value.walletType != null) {
    throw new Error('SavedCardResponse.walletType is not sent for cards');
  }

  let cardDetails = null;
  if (value.cardDetails != null) {
    cardDetails = parseCardDetails(value.cardDetails);
  } else if (status === 'VERIFIED') {
    throw new Error('SavedCardResponse.cardDetails is required when VERIFIED');
  }

  const result = { tokenRef, type, walletType, status, cardDetails };
  const orderReference = optionalString(value.orderReference, 'SavedCardResponse.orderReference');
  const paymentReference = optionalString(value.paymentReference, 'SavedCardResponse.paymentReference');
  if (orderReference !== undefined) result.orderReference = orderReference;
  if (paymentReference !== undefined) result.paymentReference = paymentReference;

  if (value['3ds2'] != null) {
    if (status !== 'AWAIT_3DS') {
      throw new Error('SavedCardResponse.3ds2 is only sent with AWAIT_3DS');
    }
    result.threeDS2 = parseThreeDS2(value['3ds2']);
  }

  if (requireContinuation && status === 'AWAIT_3DS') {
    [orderReference, paymentReference].forEach((reference) => {
      if (typeof reference !== 'string' || !REFERENCE_PATTERN.test(reference)) {
        throw new Error('SavedCardResponse references are required for AWAIT_3DS');
      }
    });
    if (!result.threeDS2) {
      throw new Error('SavedCardResponse.3ds2 is required for AWAIT_3DS');
    }
  }
  return result;
};

// Pagination is response metadata only; the list endpoint defines no query contract.
const parseSavedTokensResponse = (value) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.tokens)) {
    throw new Error('Saved tokens response is invalid');
  }
  const result = { tokens: value.tokens.map((token) => parseSavedCardResponse(token)) };
  if (value.page != null) {
    const fields = ['number', 'size', 'totalElements', 'totalPages'];
    if (typeof value.page !== 'object' || fields.some((field) =>
      !Number.isSafeInteger(value.page[field]) || value.page[field] < 0)) {
      throw new Error('Saved tokens response page is invalid');
    }
    result.page = {};
    fields.forEach((field) => { result.page[field] = value.page[field]; });
  }
  const url = supportedTermsUrl(value.tncUrl);
  if (url) result.tncUrl = url;
  return result;
};

// Wallet payloads are opaque; changing their encoding can invalidate them.
const mapAddWalletRequest = (input) => {
  if (!input || WALLET_TYPES.indexOf(input.walletType) === -1) {
    throw new Error('walletType must be APPLE_PAY or GOOGLE_PAY');
  }
  if (!isNonEmptyString(input.encryptedPayload)) {
    throw new Error('encryptedPayload is required');
  }
  return {
    walletType: input.walletType,
    encryptedPayload: input.encryptedPayload,
  };
};

const BROWSER_INFO_FIELDS = [
  'browserAcceptHeader',
  'browserJavaEnabled',
  'browserJavascriptEnabled',
  'browserLanguage',
  'acceptBrowserLanguages',
  'browserColorDepth',
  'browserScreenHeight',
  'browserScreenWidth',
  'browserTZ',
  'browserUserAgent',
  'challengeWindowSize',
];

const mapThreeDSAuthenticationsRequest = (input) => {
  if (!input || THREE_DS_COMP_IND.indexOf(input.threeDSCompInd) === -1) {
    throw new Error('threeDSCompInd must be Y, N or U');
  }
  if (!input.browserInfo || typeof input.browserInfo !== 'object') {
    throw new Error('browserInfo is required');
  }
  const browserInfo = {};
  BROWSER_INFO_FIELDS.forEach((field) => {
    if (input.browserInfo[field] !== undefined) {
      browserInfo[field] = input.browserInfo[field];
    }
  });
  return {
    deviceChannel: 'BRW',
    threeDSCompInd: input.threeDSCompInd,
    browserInfo,
  };
};

const mapThreeDSChallengeResponseRequest = (input) => {
  if (!input || !isNonEmptyString(input.base64EncodedCRes)) {
    throw new Error('base64EncodedCRes is required');
  }
  return { base64EncodedCRes: input.base64EncodedCRes };
};

module.exports = {
  TOKEN_TYPES,
  WALLET_TYPES,
  TOKEN_STATUSES,
  parseSavedCardResponse,
  parseSavedTokensResponse,
  mapAddWalletRequest,
  mapThreeDSAuthenticationsRequest,
  mapThreeDSChallengeResponseRequest,
};
