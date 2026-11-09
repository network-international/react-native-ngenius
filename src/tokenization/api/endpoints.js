const { TokenizationApiError } = require('./errors');

const REFERENCE_PATTERN = /^[A-Za-z0-9:_-]{1,100}$/;

const encodePathSegment = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return encodeURIComponent(value);
};

const referenceSegment = (value, name) => {
  if (typeof value !== 'string' || value !== value.trim() || !REFERENCE_PATTERN.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
};

const outletPath = (outletRef) =>
  `/api/outlets/${encodePathSegment(outletRef, 'outletRef')}`;

const threeDSPath = ({ outletRef, tokenRef, orderReference, paymentReference }) =>
  `${outletPath(outletRef)}/tokens/${referenceSegment(tokenRef, 'tokenRef')}` +
  `/orders/${referenceSegment(orderReference, 'orderReference')}` +
  `/payments/${referenceSegment(paymentReference, 'paymentReference')}/3ds2`;

const validReference = value =>
  typeof value === 'string' && value === value.trim() && REFERENCE_PATTERN.test(value);

const sessionCollectionPath = ({ outletRef }) => {
  if (typeof outletRef !== 'string' || !outletRef.trim()) {
    throw new TokenizationApiError({
      status: 0, code: 'INVALID_OUTLET_REF', message: 'outletRef is required',
    });
  }
  return `${outletPath(outletRef)}/payment-tokenization-sessions`;
};

const sessionPath = ({ outletRef, sessionRef }) => {
  if (!validReference(sessionRef)) {
    throw new TokenizationApiError({
      status: 0, code: 'INVALID_SESSION_REF', message: 'sessionRef is required and must be valid',
    });
  }
  return `${sessionCollectionPath({ outletRef })}/${encodeURIComponent(sessionRef)}`;
};

const TOKENIZATION_PATHS = {
  createSession: sessionCollectionPath,
  getSession: sessionPath,
  // PAN/CVV stay native; this path is used only to prepare a native request.
  addCard: args => `${sessionPath(args)}/cards`,
  selectToken: args => `${sessionPath(args)}/selected-token`,
  threeDSAuthentications: (ids) => `${threeDSPath(ids)}/authentications`,
  threeDSChallengeResponse: (ids) => `${threeDSPath(ids)}/challenge-response`,
};

const buildQuery = (params) => {
  const parts = [];
  params.forEach(([key, value]) => {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });
  return parts.length > 0 ? `?${parts.join('&')}` : '';
};

const resolveTokenizationUrl = (baseUrl, path, query = []) => {
  const root = String(baseUrl).replace(/\/+$/, '');
  return `${root}${path}${buildQuery(query)}`;
};

module.exports = {
  REFERENCE_PATTERN,
  encodePathSegment,
  validReference,
  TOKENIZATION_PATHS,
  resolveTokenizationUrl,
};
