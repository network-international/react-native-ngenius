const { registerCardContext } = require('../cardContext');
const { buildTokenizationHeaders } = require('./headers');
const {
  errorFromResponse,
  errorFromSessionResponse,
  errorFromMalformedResponse,
  TokenizationApiError,
  isTimeoutStatus,
  isRequestTimeout,
  requestTimeoutError,
} = require('./errors');
const { TOKENIZATION_PATHS, resolveTokenizationUrl } = require('./endpoints');
const {
  parseSavedCardResponse,
  parseTokenizationSession,
  mapThreeDSAuthenticationsRequest,
  mapThreeDSChallengeResponseRequest,
} = require('./models');
const { createFetchTransport, parseJsonBody } = require('./transport');
const { addWalletBackendPending } = require('./addWallet');
const { createSessionTokenSelector } = require('./sessionTokenSelection');
const { withRequestDeadline } = require('./requestDeadline');

const ACCESS_TOKEN_UNAVAILABLE = 'ACCESS_TOKEN_UNAVAILABLE';

const resolveAccessToken = async getAccessToken => {
  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (error) {
    if (isRequestTimeout(error)) throw requestTimeoutError();
    accessToken = undefined;
  }
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new TokenizationApiError({
      status: 0,
      code: ACCESS_TOKEN_UNAVAILABLE,
      message: 'Access token is not available',
    });
  }
  return accessToken;
};

const parseSuccess = (parse, body, status) => {
  try {
    return parse(body);
  } catch (error) {
    throw new TokenizationApiError({
      status,
      code: 'MALFORMED_RESPONSE',
      message:
        (error && error.message) ||
        'Response did not match the tokenization contract',
    });
  }
};

const threeDSIds = args => ({
  outletRef: args && args.outletRef,
  tokenRef: args && args.tokenRef,
  orderReference: args && args.orderReference,
  paymentReference: args && args.paymentReference,
});

const createTokenizationClient = options => {
  if (!options || typeof options !== 'object') {
    throw new Error('createTokenizationClient options are required');
  }
  if (typeof options.baseUrl !== 'string' || options.baseUrl.length === 0) {
    throw new Error('createTokenizationClient requires baseUrl');
  }
  if (typeof options.getAccessToken !== 'function') {
    throw new Error('createTokenizationClient requires getAccessToken');
  }
  const baseUrl = options.baseUrl;
  const getAccessToken = options.getAccessToken;
  const transport =
    options.transport || createFetchTransport(options.fetchImpl);

  const sendRequest = ({ method, path, query, body, responseMode }) => withRequestDeadline(async deadline => {
    const url = resolveTokenizationUrl(baseUrl, path, query);
    const accessToken = await resolveAccessToken(getAccessToken);
    // A provider may ignore cancellation and finish after the caller timed out.
    // Never send a late request with its newly returned credential.
    deadline.throwIfExpired();
    let response;
    try {
      const transportRequest = {
        url,
        method,
        headers: buildTokenizationHeaders({ accessToken }),
        body,
      };
      if (deadline.signal) transportRequest.signal = deadline.signal;
      if (responseMode === 'status-only') transportRequest.responseMode = responseMode;
      response = await transport(transportRequest);
      deadline.throwIfExpired();
      if (isTimeoutStatus(response?.status)) throw requestTimeoutError();
    } catch (error) {
      deadline.throwIfExpired();
      if (isRequestTimeout(error)) throw requestTimeoutError();
      throw new TokenizationApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Tokenization request could not be sent',
      });
    }
    return response;
  });

  const request = async ({ parse, sanitizeError = false, ...args }) => {
    const response = await sendRequest(args);
    const status = response?.status;
    const success = Number.isInteger(status) && status >= 200 && status < 300;
    if (sanitizeError && !success) throw errorFromSessionResponse({ status });
    const parsedJson = parseJsonBody(response?.text);
    if (!parsedJson.ok) {
      throw errorFromMalformedResponse({ status });
    }
    if (success) {
      return parseSuccess(parse, parsedJson.body, status);
    }
    throw errorFromResponse({ status, body: parsedJson.body });
  };

  const continuationParse = body =>
    parseSavedCardResponse(body, { requireContinuation: true });

  const client = {
    getSession: async args =>
      request({
        method: 'GET',
        path: TOKENIZATION_PATHS.getSession({
          outletRef: args?.outletRef, sessionRef: args?.sessionRef,
        }),
        query: args?.skipConsent === true ? [['consentOff', 'true']] : [],
        parse: parseTokenizationSession,
        sanitizeError: true,
      }),
    selectToken: createSessionTokenSelector({ request: sendRequest }),
    addWallet: addWalletBackendPending,
    authenticateThreeDS: async args =>
      request({
        method: 'POST',
        path: TOKENIZATION_PATHS.threeDSAuthentications(threeDSIds(args)),
        body: mapThreeDSAuthenticationsRequest(args),
        parse: continuationParse,
      }),
    submitThreeDSChallengeResponse: async args =>
      request({
        method: 'POST',
        path: TOKENIZATION_PATHS.threeDSChallengeResponse(threeDSIds(args)),
        body: mapThreeDSChallengeResponseRequest(args),
        parse: continuationParse,
      }),
  };
  return registerCardContext(client, {
    prepareRequest: async ({ outletRef, sessionRef }) => {
      // JS transports cannot receive plaintext cards. Do not bypass a caller's
      // mock/custom transport by silently submitting a native request instead.
      if (options.transport || options.fetchImpl)
        throw new TokenizationApiError({
          status: 0,
          code: 'NATIVE_CARD_TRANSPORT_UNAVAILABLE',
          message: 'Custom JS transport does not support native Card requests',
        });
      const url = resolveTokenizationUrl(baseUrl, TOKENIZATION_PATHS.addCard({ outletRef, sessionRef }));
      return withRequestDeadline(async deadline => {
        const accessToken = await resolveAccessToken(getAccessToken);
        deadline.throwIfExpired();
        return { url, accessToken };
      });
    },
  });
};

module.exports = {
  ACCESS_TOKEN_UNAVAILABLE,
  createTokenizationClient,
};
