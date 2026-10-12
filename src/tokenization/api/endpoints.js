// Paths from the backend contracts: add-card-api.json, add-wallet-api.json,
// saved-tokens-api.json (received 9 Oct 2026).
const REFERENCE_PATTERN = /^[A-Za-z0-9:_-]{1,100}$/;

const encodePathSegment = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return encodeURIComponent(value);
};

const referenceSegment = (value, name) => {
  if (typeof value !== 'string' || !REFERENCE_PATTERN.test(value)) {
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

const TOKENIZATION_PATHS = {
  savedTokens: ({ outletRef }) => `${outletPath(outletRef)}/tokens`,
  // Card create is submitted by the native secure layer, never from JS.
  addCard: ({ outletRef }) => `${outletPath(outletRef)}/cards`,
  addWallet: ({ outletRef }) => `${outletPath(outletRef)}/wallets`,
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
  TOKENIZATION_PATHS,
  resolveTokenizationUrl,
};
