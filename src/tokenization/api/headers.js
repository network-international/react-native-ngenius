const TOKENIZATION_MEDIA_TYPE =
  'application/vnd.ni-payment-tokenization.v1+json';

const HEADER_ACCEPT = 'Accept';
const HEADER_CONTENT_TYPE = 'Content-Type';
const HEADER_AUTHORIZATION = 'Authorization';
const HEADER_API_KEY = 'X-API-Key';
const HEADER_CORRELATION_ID = 'X-Correlation-Id';
const HEADER_IDEMPOTENCY_KEY = 'Idempotency-Key';

const bearerAuthorization = (accessToken) => {
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('tokenization auth provider must return accessToken');
  }
  if (/^Bearer\s+/i.test(accessToken)) {
    return accessToken;
  }
  return `Bearer ${accessToken}`;
};

const buildTokenizationHeaders = ({
  accessToken,
  apiKey,
  correlationId,
  idempotencyKey,
  hasBody,
}) => {
  const headers = {
    [HEADER_ACCEPT]: TOKENIZATION_MEDIA_TYPE,
    [HEADER_AUTHORIZATION]: bearerAuthorization(accessToken),
  };
  if (hasBody) {
    headers[HEADER_CONTENT_TYPE] = TOKENIZATION_MEDIA_TYPE;
  }
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    headers[HEADER_API_KEY] = apiKey;
  }
  if (typeof correlationId === 'string' && correlationId.length > 0) {
    headers[HEADER_CORRELATION_ID] = correlationId;
  }
  if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0) {
    headers[HEADER_IDEMPOTENCY_KEY] = idempotencyKey;
  }
  return headers;
};

const readHeader = (headers, name) => {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  const target = String(name).toLowerCase();
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i].toLowerCase() === target) {
      const value = headers[keys[i]];
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    }
  }
  return undefined;
};

module.exports = {
  TOKENIZATION_MEDIA_TYPE,
  HEADER_ACCEPT,
  HEADER_CONTENT_TYPE,
  HEADER_AUTHORIZATION,
  HEADER_API_KEY,
  HEADER_CORRELATION_ID,
  HEADER_IDEMPOTENCY_KEY,
  bearerAuthorization,
  buildTokenizationHeaders,
  readHeader,
};
