const { TOKENIZATION_PATHS } = require('./endpoints');
const { TokenizationApiError, errorFromSessionSelectionResponse } = require('./errors');

// UUID version/variant constraints are not defined by the preliminary contract.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createSessionTokenSelector = ({ enabled, request }) => async (args = {}) => {
  if (enabled !== true) {
    throw new TokenizationApiError({
      status: 0,
      code: 'SESSION_SELECTION_NOT_ENABLED',
      message: 'The preliminary session selection API is not enabled',
    });
  }
  const selectedToken = args && args.selectedToken;
  if (typeof selectedToken !== 'string' || selectedToken.length !== 36 || !UUID_PATTERN.test(selectedToken)) {
    throw new TokenizationApiError({
      status: 0,
      code: 'INVALID_SESSION_SELECTION',
      message: 'selectedToken must be a UUID',
    });
  }
  const path = TOKENIZATION_PATHS.selectSessionToken({
    outletRef: args && args.outletRef,
    sessionRef: args && args.sessionRef,
  });
  const response = await request({
    method: 'PUT', path, body: { selectedToken }, responseMode: 'status-only',
  });
  // Only the supplied contract's exact 200 confirms persistence. The body is
  // deliberately not parsed or forwarded, even when it contains token details.
  if (!response || response.status !== 200) {
    throw errorFromSessionSelectionResponse({ status: response && response.status });
  }
  return { status: 'SELECTED' };
};

module.exports = { createSessionTokenSelector };
