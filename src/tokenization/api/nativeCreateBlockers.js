/**
 * Native NISdk / payment-sdk cannot satisfy CreateWalletRequest from RN today.
 *
 * Apple Pay (ios/NiSdk.m initiateApplePay): callback is status only.
 * Google Pay (NiSdkModule.java): callback is PaymentData.tokenizationData.token,
 * which is the Google Pay PAYMENT_GATEWAY encrypted payload — not DAN,
 * onlinePaymentCryptogram, or NI tokenRef.
 */

const WALLET_CREATE_BLOCKER =
  'Apple Pay RN results are status-only, and Google Pay RN results expose tokenizationData.token (gateway encrypted payload), not CreateWalletRequest.dan / onlinePaymentCryptogram. Wallet payload transformation belongs in native or backend code.';

const inspectNativeWalletForCreateRequest = (nativeResult) => {
  if (!nativeResult || typeof nativeResult !== 'object') {
    return {
      mappable: false,
      reason: WALLET_CREATE_BLOCKER,
    };
  }
  return {
    mappable: false,
    reason: WALLET_CREATE_BLOCKER,
    hasStatus: typeof nativeResult.status === 'string',
    hasGooglePayToken: typeof nativeResult.token === 'string',
  };
};

const CARD_CREATE_BLOCKER =
  'The backend V1 create-card contract accepts clear card credentials, while react-native-ngenius currently delegates PCI card capture to NISdk and does not expose those credentials to JS.';

module.exports = {
  WALLET_CREATE_BLOCKER,
  CARD_CREATE_BLOCKER,
  inspectNativeWalletForCreateRequest,
};
