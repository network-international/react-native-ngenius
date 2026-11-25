const { parseSavedCardResponse } = require('./api/models');

// Re-read the current list at confirmation time, rather than trusting a row payload.
const savedPaymentMethodSelection = (tokens, tokenRef) => {
  if (!Array.isArray(tokens) || typeof tokenRef !== 'string') return null;
  const match = tokens.find(token => token && token.tokenRef === tokenRef);
  if (!match || match.status !== 'VERIFIED') return null;
  try {
    const safe = parseSavedCardResponse(match);
    const { scheme, last4, expiry } = safe.cardDetails;
    return {
      tokenRef: safe.tokenRef,
      type: safe.type,
      walletType: safe.walletType,
      cardDetails: { scheme, last4, expiry },
    };
  } catch {
    return null;
  }
};

const defaultSelectedTokenRef = (tokens, currentTokenRef) => {
  if (savedPaymentMethodSelection(tokens, currentTokenRef)) return currentTokenRef;
  if (!Array.isArray(tokens)) return null;
  const first = tokens.find(token => savedPaymentMethodSelection([token], token?.tokenRef));
  return first ? first.tokenRef : null;
};

module.exports = { savedPaymentMethodSelection, defaultSelectedTokenRef };
