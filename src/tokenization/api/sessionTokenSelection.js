const { TOKENIZATION_PATHS, validReference } = require('./endpoints');
const { TokenizationApiError, errorFromSessionSelectionResponse } = require('./errors');

const createSessionTokenSelector = ({ request }) => {
  const inFlight = new Set();
  return async args => {
    const { outletRef, sessionRef, tokenRef } = args || {};
    if (!validReference(tokenRef)) {
      throw new TokenizationApiError({
        status: 0, code: 'INVALID_TOKEN_REF', message: 'tokenRef is required and must be valid',
      });
    }
    const path = TOKENIZATION_PATHS.selectToken({ outletRef, sessionRef });
    if (inFlight.has(path)) {
      throw new TokenizationApiError({
        status: 0, code: 'SESSION_SELECTION_IN_PROGRESS', message: 'Payment method selection is already in progress',
      });
    }
    inFlight.add(path);
    try {
      const response = await request({
        method: 'PUT', path, body: { tokenRef }, responseMode: 'status-only',
      });
      if (response?.status !== 200 && response?.status !== 204) {
        throw errorFromSessionSelectionResponse({ status: response?.status });
      }
      return { status: 'SELECTED' };
    } finally {
      inFlight.delete(path);
    }
  };
};

module.exports = { createSessionTokenSelector };
