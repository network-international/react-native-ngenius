const { buildTokenizationHeaders } = require('./headers');
const {
  errorFromResponse,
  errorFromMalformedResponse,
  TokenizationApiError,
} = require('./errors');
const {
  REFERENCE_PATTERN,
  TOKENIZATION_PATHS,
  resolveTokenizationUrl,
} = require('./endpoints');
const {
  parseSavedCardResponse,
  parseSavedTokensResponse,
  mapAddWalletRequest,
  mapThreeDSAuthenticationsRequest,
  mapThreeDSChallengeResponseRequest,
} = require('./models');
const { createFetchTransport, parseJsonBody } = require('./transport');

const ACCESS_TOKEN_UNAVAILABLE = 'ACCESS_TOKEN_UNAVAILABLE';

// The merchant backend obtains the identity access token; the SDK asks for it
// just in time and never stores, refreshes or logs it.
const resolveAccessToken = async (getAccessToken) => {
  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (error) {
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
      message: (error && error.message) || 'Response did not match the tokenization contract',
    });
  }
};

const savedTokensQuery = ({ tokens, consentOff }) => {
  const query = [];
  if (tokens !== undefined) {
    if (!Array.isArray(tokens)) {
      throw new Error('tokens must be an array of tokenRef values');
    }
    tokens.forEach((tokenRef) => {
      if (typeof tokenRef !== 'string' || !REFERENCE_PATTERN.test(tokenRef)) {
        throw new Error('tokens contains an invalid tokenRef');
      }
      query.push(['tokens', tokenRef]);
    });
  }
  if (typeof consentOff === 'boolean') {
    query.push(['consentOff', String(consentOff)]);
  }
  return query;
};

const threeDSIds = (args) => ({
  outletRef: args && args.outletRef,
  tokenRef: args && args.tokenRef,
  orderReference: args && args.orderReference,
  paymentReference: args && args.paymentReference,
});

const createTokenizationClient = (options) => {
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
  const transport = options.transport || createFetchTransport(options.fetchImpl);

  const request = async ({ method, path, query, body, parse }) => {
    const url = resolveTokenizationUrl(baseUrl, path, query);
    const accessToken = await resolveAccessToken(getAccessToken);
    let response;
    try {
      response = await transport({
        url,
        method,
        headers: buildTokenizationHeaders({ accessToken }),
        body,
      });
    } catch (error) {
      throw new TokenizationApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Tokenization request could not be sent',
      });
    }
    const status = response.status;
    const parsedJson = parseJsonBody(response.text);
    if (!parsedJson.ok) {
      throw errorFromMalformedResponse({ status });
    }
    if (status >= 200 && status < 300) {
      return parseSuccess(parse, parsedJson.body, status);
    }
    throw errorFromResponse({ status, body: parsedJson.body });
  };

  const continuationParse = (body) =>
    parseSavedCardResponse(body, { requireContinuation: true });

  return {
    getSavedTokens: async (args = {}) =>
      request({
        method: 'GET',
        path: TOKENIZATION_PATHS.savedTokens({ outletRef: args.outletRef }),
        query: savedTokensQuery(args),
        parse: (body) => parseSavedTokensResponse(body, { consentOff: args.consentOff }),
      }),
    addWallet: async (args) =>
      request({
        method: 'POST',
        path: TOKENIZATION_PATHS.addWallet({ outletRef: args && args.outletRef }),
        body: mapAddWalletRequest(args),
        parse: continuationParse,
      }),
    authenticateThreeDS: async (args) =>
      request({
        method: 'POST',
        path: TOKENIZATION_PATHS.threeDSAuthentications(threeDSIds(args)),
        body: mapThreeDSAuthenticationsRequest(args),
        parse: continuationParse,
      }),
    submitThreeDSChallengeResponse: async (args) =>
      request({
        method: 'POST',
        path: TOKENIZATION_PATHS.threeDSChallengeResponse(threeDSIds(args)),
        body: mapThreeDSChallengeResponseRequest(args),
        parse: continuationParse,
      }),
  };
};

module.exports = {
  ACCESS_TOKEN_UNAVAILABLE,
  createTokenizationClient,
};
