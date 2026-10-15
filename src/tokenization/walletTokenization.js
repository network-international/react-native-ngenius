const { TokenizationApiError } = require('./api/errors');
const { VERIFICATION_STATES, stateForSavedToken } = require('./verificationStates');
const {
  savedTokenResult,
  awaitingThreeDSResult,
  apiErrorResult,
} = require('./session');

const METHOD = 'GOOGLE_PAY';

const runGooglePayTokenization = async ({
  client,
  outletRef,
  order,
  googlePayConfig,
  initiateGooglePay,
  onVerifying,
}) => {
  let encryptedPayload;
  try {
    const response = await initiateGooglePay(order, googlePayConfig);
    encryptedPayload = response && response.token;
  } catch (error) {
    if (error && error.status === 'Aborted') {
      return { state: VERIFICATION_STATES.READY };
    }
    return {
      state: VERIFICATION_STATES.FAILED,
      result: apiErrorResult({
        method: METHOD,
        error: { code: 'WALLET_CAPTURE_FAILED', message: 'Google Pay did not complete' },
      }),
    };
  }
  if (typeof encryptedPayload !== 'string' || encryptedPayload.length === 0) {
    return {
      state: VERIFICATION_STATES.FAILED,
      result: apiErrorResult({
        method: METHOD,
        error: { code: 'WALLET_TOKEN_MISSING', message: 'Google Pay did not return a payment token' },
      }),
    };
  }

  if (onVerifying) {
    onVerifying();
  }
  let savedToken;
  try {
    savedToken = await client.addWallet({ outletRef, walletType: METHOD, encryptedPayload });
  } catch (error) {
    const safeError =
      error instanceof TokenizationApiError
        ? error
        : { code: 'UNKNOWN_ERROR', message: 'Tokenization request failed' };
    return {
      state: VERIFICATION_STATES.FAILED,
      result: apiErrorResult({ method: METHOD, error: safeError }),
    };
  }

  const state = stateForSavedToken(savedToken);
  if (state === VERIFICATION_STATES.SUCCESS) {
    return { state, result: savedTokenResult({ method: METHOD, savedToken }) };
  }
  if (state === VERIFICATION_STATES.AWAITING_3DS) {
    return { state, result: awaitingThreeDSResult({ method: METHOD }) };
  }
  return {
    state,
    result: apiErrorResult({
      method: METHOD,
      error: { code: 'walletVerificationFailed', message: 'Wallet verification failed' },
    }),
  };
};

module.exports = { runGooglePayTokenization };
