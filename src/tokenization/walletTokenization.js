const { mapConsentRequest } = require('./consentData');
const { TokenizationApiError } = require('./api/errors');
const {
  VERIFICATION_STATES,
  stateForSavedToken,
} = require('./verificationStates');
const {
  savedTokenResult,
  awaitingThreeDSResult,
  apiErrorResult,
} = require('./session');

const runWalletTokenization = async ({
  method: METHOD = 'GOOGLE_PAY',
  client,
  outletRef,
  order,
  googlePayConfig,
  captureWallet,
  onVerifying,
  consent,
  getConsentData,
  isCurrent = () => true,
}) => {
  if (!isCurrent()) return { state: VERIFICATION_STATES.READY };
  let encryptedPayload;
  try {
    const response = await captureWallet(order, googlePayConfig);
    encryptedPayload = response && response.token;
  } catch (error) {
    if (error && error.status === 'Aborted') {
      return { state: VERIFICATION_STATES.READY };
    }
    return {
      state: VERIFICATION_STATES.FAILED,
      result: apiErrorResult({
        method: METHOD,
        error: {
          code: 'WALLET_CAPTURE_FAILED',
          message: 'Wallet capture did not complete',
        },
      }),
    };
  }
  if (!isCurrent()) return { state: VERIFICATION_STATES.READY };
  if (typeof encryptedPayload !== 'string' || encryptedPayload.length === 0) {
    return {
      state: VERIFICATION_STATES.FAILED,
      result: apiErrorResult({
        method: METHOD,
        error: {
          code: 'WALLET_TOKEN_MISSING',
          message: 'Wallet did not return a payment token',
        },
      }),
    };
  }

  if (onVerifying) {
    onVerifying();
  }
  let savedToken;
  try {
    const tokenData = { outletRef, walletType: METHOD, encryptedPayload };
    const resolvedConsent = getConsentData ? getConsentData() : consent;
    const request = resolvedConsent
      ? mapConsentRequest({ tokenData, consent: resolvedConsent })
      : tokenData;
    savedToken = await client.addWallet(request);
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
      error: {
        code: 'walletVerificationFailed',
        message: 'Wallet verification failed',
      },
    }),
  };
};

const runGooglePayTokenization = ({ initiateGooglePay, ...args }) =>
  runWalletTokenization({
    ...args,
    method: 'GOOGLE_PAY',
    captureWallet: initiateGooglePay,
  });

module.exports = { runWalletTokenization, runGooglePayTokenization };
