const {
  isWalletTokenizationAvailable,
  mapAddWalletRequest,
  validateWalletContext,
  walletBackendPendingError,
} = require('./api/addWallet');
const { parseSavedTokensResponse } = require('./api/models');
const { VERIFICATION_STATES } = require('./verificationStates');
const { apiErrorResult } = require('./session');

const runWalletTokenization = async ({
  method = 'GOOGLE_PAY',
  client,
  outletRef,
  sessionRef,
  usageType,
  order,
  googlePayConfig,
  captureWallet,
  onVerifying,
  consent,
  getConsentData,
  isCurrent = () => true,
}) => {
  const ready = { state: VERIFICATION_STATES.READY };
  const fail = error => ({
    state: VERIFICATION_STATES.FAILED,
    result: apiErrorResult({ method, error }),
  });
  if (!isCurrent()) return ready;
  try {
    validateWalletContext({ outletRef, sessionRef, usageType });
  } catch (error) {
    return fail(error);
  }
  if (!isWalletTokenizationAvailable(client)) {
    return fail(walletBackendPendingError());
  }

  let encryptedPayload;
  try {
    const response = await captureWallet(order, googlePayConfig);
    encryptedPayload = response?.token;
  } catch (error) {
    if (error?.status === 'Aborted' || !isCurrent()) return ready;
    return fail({
      code: 'WALLET_CAPTURE_FAILED',
      message: 'Wallet capture did not complete',
    });
  }
  if (!isCurrent()) return ready;
  if (typeof encryptedPayload !== 'string' || !encryptedPayload.length) {
    return fail({
      code: 'WALLET_TOKEN_MISSING',
      message: 'Wallet did not return a payment token',
    });
  }

  let updatedTokenList;
  try {
    const request = mapAddWalletRequest({
      walletType: method,
      encryptedPayload,
      usageType,
      consentData: getConsentData ? getConsentData() : consent,
    });
    onVerifying?.();
    updatedTokenList = await client.addWallet({ outletRef, sessionRef, ...request });
  } catch {
    if (!isCurrent()) return ready;
    return fail({
      code: 'ADD_WALLET_FAILED',
      message: 'Wallet tokenization request failed',
    });
  }
  if (!isCurrent()) return ready;
  try {
    return {
      state: VERIFICATION_STATES.SUCCESS,
      updatedTokenList: parseSavedTokensResponse(updatedTokenList),
    };
  } catch {
    return fail({
      code: 'MALFORMED_RESPONSE',
      message: 'Wallet tokenization response is invalid',
    });
  }
};

const runGooglePayTokenization = ({ initiateGooglePay, ...args }) =>
  runWalletTokenization({
    ...args,
    method: 'GOOGLE_PAY',
    captureWallet: initiateGooglePay,
  });

module.exports = { runWalletTokenization, runGooglePayTokenization };
