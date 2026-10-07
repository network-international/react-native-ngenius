const { resolveTokenizationBaseUrl } = require('./environments');
const {
  buildTokenizationHeaders,
  readHeader,
  HEADER_CORRELATION_ID,
} = require('./headers');
const { errorFromResponse, errorFromMalformedResponse, TokenizationApiError } = require('./errors');
const { TOKENIZATION_PATHS, resolveTokenizationUrl } = require('./endpoints');
const {
  parsePaymentMethodResponse,
  parsePaymentMethodListResponse,
  parseValidatePaymentMethodResponse,
  mapCreateCardRequest,
  mapCreateWalletRequest,
} = require('./models');
const { createFetchTransport, parseJsonBody } = require('./transport');
const { createIdempotencyStore, createIdempotencyKey } = require('./idempotency');

const resolveAuth = async (getAuth) => {
  if (typeof getAuth !== 'function') {
    throw new TokenizationApiError({
      status: 0,
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Bearer JWT token',
    });
  }
  const auth = await getAuth();
  const accessToken =
    auth && typeof auth.accessToken === 'string' ? auth.accessToken : '';
  if (!accessToken) {
    throw new TokenizationApiError({
      status: 0,
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Bearer JWT token',
    });
  }
  const apiKey =
    auth && typeof auth.apiKey === 'string' && auth.apiKey.length > 0
      ? auth.apiKey
      : undefined;
  return { accessToken, apiKey };
};

const parseSuccess = (parse, body, responseHeaders, status) => {
  try {
    return parse(body, responseHeaders);
  } catch (error) {
    throw new TokenizationApiError({
      status,
      code: 'MALFORMED_RESPONSE',
      message:
        (error && error.message) ||
        'Response did not match Payment Method Tokenization V1',
      correlationId: readHeader(responseHeaders, HEADER_CORRELATION_ID),
    });
  }
};

const createTokenizationClient = (options) => {
  if (!options || typeof options !== 'object') {
    throw new Error('createTokenizationClient options are required');
  }
  const baseUrl =
    typeof options.baseUrl === 'string' && options.baseUrl.length > 0
      ? options.baseUrl.replace(/\/+$/, '')
      : resolveTokenizationBaseUrl(options.environment);
  const transport = options.transport || createFetchTransport(options.fetchImpl);
  const getAuth = options.getAuth;
  const getCorrelationId =
    typeof options.getCorrelationId === 'function'
      ? options.getCorrelationId
      : undefined;
  const idempotency = createIdempotencyStore();

  const request = async ({
    method,
    path,
    correlationId,
    idempotencyKey,
    body,
    emptySuccessStatuses,
    parse,
  }) => {
    const auth = await resolveAuth(getAuth);
    const resolvedCorrelationId =
      correlationId || (getCorrelationId ? getCorrelationId() : undefined);
    const headers = buildTokenizationHeaders({
      accessToken: auth.accessToken,
      apiKey: auth.apiKey,
      correlationId: resolvedCorrelationId,
      idempotencyKey,
      hasBody: body !== undefined,
    });
    const url = resolveTokenizationUrl(baseUrl, path);
    const response = await transport({
      url,
      method,
      headers,
      body,
    });
    const status = response.status;
    const responseHeaders = response.headers || {};
    if (emptySuccessStatuses && emptySuccessStatuses.indexOf(status) !== -1) {
      return {
        correlationId:
          readHeader(responseHeaders, HEADER_CORRELATION_ID) ||
          resolvedCorrelationId,
      };
    }
    const parsedJson = parseJsonBody(response.text);
    if (!parsedJson.ok) {
      throw errorFromMalformedResponse({
        status,
        headers: responseHeaders,
        text: response.text,
      });
    }
    if (status >= 200 && status < 300) {
      return parseSuccess(parse, parsedJson.body, responseHeaders, status);
    }
    throw errorFromResponse({
      status,
      headers: responseHeaders,
      body: parsedJson.body,
    });
  };

  const idsFrom = (args) => ({
    outletId: args.outletId,
    consumerId: args.consumerId,
    tokenRef: args.tokenRef,
  });

  const resolveCreateIdempotencyKey = (args) => {
    if (args && typeof args.idempotencyKey === 'string' && args.idempotencyKey.length > 0) {
      return args.idempotencyKey;
    }
    if (args && typeof args.operationId === 'string' && args.operationId.length > 0) {
      return idempotency.getOrCreate(args.operationId);
    }
    return createIdempotencyKey();
  };

  const client = {
    listPaymentMethods: (args) =>
      request({
        method: 'GET',
        path: TOKENIZATION_PATHS.listPaymentMethods(idsFrom(args)),
        correlationId: args && args.correlationId,
        parse: parsePaymentMethodListResponse,
      }),
    getPaymentMethod: (args) =>
      request({
        method: 'GET',
        path: TOKENIZATION_PATHS.getPaymentMethod(idsFrom(args)),
        correlationId: args && args.correlationId,
        parse: parsePaymentMethodResponse,
      }),
    validatePaymentMethod: (args) =>
      request({
        method: 'POST',
        path: TOKENIZATION_PATHS.validatePaymentMethod(idsFrom(args)),
        correlationId: args && args.correlationId,
        parse: parseValidatePaymentMethodResponse,
      }),
    deletePaymentMethod: (args) =>
      request({
        method: 'DELETE',
        path: TOKENIZATION_PATHS.deletePaymentMethod(idsFrom(args)),
        correlationId: args && args.correlationId,
        emptySuccessStatuses: [204],
        parse: () => undefined,
      }),
    // Not called from NgeniusTokenization: CreateCardRequest requires PAN/CVV
    // and current NISdk does not expose them safely to JS.
    createCardPaymentMethod: (args) => {
      return request({
        method: 'POST',
        path: TOKENIZATION_PATHS.createCardPaymentMethod(idsFrom(args)),
        correlationId: args && args.correlationId,
        idempotencyKey: resolveCreateIdempotencyKey(args),
        body: mapCreateCardRequest(args && args.request),
        parse: parsePaymentMethodResponse,
      });
    },
    // Not called from NgeniusTokenization: Apple Pay / Google Pay RN results
    // do not expose CreateWalletRequest.dan / onlinePaymentCryptogram.
    createWalletPaymentMethod: (args) => {
      return request({
        method: 'POST',
        path: TOKENIZATION_PATHS.createWalletPaymentMethod(idsFrom(args)),
        correlationId: args && args.correlationId,
        idempotencyKey: resolveCreateIdempotencyKey(args),
        body: mapCreateWalletRequest(args && args.request),
        parse: parsePaymentMethodResponse,
      });
    },
  };

  return client;
};

module.exports = {
  createTokenizationClient,
};
