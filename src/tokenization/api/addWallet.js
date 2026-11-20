const { serializeConsentData } = require('../consentData');
const { validateUsageType } = require('../usageType');
const { validReference } = require('./endpoints');
const { TokenizationApiError } = require('./errors');
const { WALLET_TYPES } = require('./models');

const invalidWalletRequest = message =>
  new TokenizationApiError({
    status: 0,
    code: 'INVALID_WALLET_REQUEST',
    message,
  });

const validateWalletContext = (input = {}) => {
  validateUsageType(input?.usageType);
  if (typeof input.outletRef !== 'string' || !input.outletRef.trim()) {
    throw invalidWalletRequest('outletRef is required');
  }
  if (!validReference(input.sessionRef)) {
    throw invalidWalletRequest('sessionRef is required and must be valid');
  }
};

// Wallet payloads are opaque; changing their encoding can invalidate them.
const mapAddWalletRequest = input => {
  const usageType = validateUsageType(input?.usageType);
  if (!WALLET_TYPES.includes(input.walletType)) {
    throw invalidWalletRequest('walletType must be APPLE_PAY or GOOGLE_PAY');
  }
  if (typeof input.encryptedPayload !== 'string' || !input.encryptedPayload.length) {
    throw invalidWalletRequest('encryptedPayload is required');
  }

  let consentData;
  try {
    consentData = serializeConsentData(input.consentData);
  } catch {
    throw invalidWalletRequest('consentData is invalid');
  }
  return {
    walletType: input.walletType,
    encryptedPayload: input.encryptedPayload,
    usageType,
    consentData,
  };
};

const walletBackendPendingError = () =>
  new TokenizationApiError({
    status: 0,
    code: 'ADD_WALLET_BACKEND_PENDING',
    message: 'Wallet tokenization is not available yet',
  });

// An explicit capability is required before opening the wallet sheet. The SDK
// client has no Add Wallet endpoint while the session integration is pending.
const isWalletTokenizationAvailable = client =>
  client?.supportsAddWallet === true && typeof client.addWallet === 'function';

const addWalletBackendPending = async input => {
  validateWalletContext(input);
  mapAddWalletRequest(input);
  throw walletBackendPendingError();
};

module.exports = {
  addWalletBackendPending,
  isWalletTokenizationAvailable,
  mapAddWalletRequest,
  validateWalletContext,
  walletBackendPendingError,
};
