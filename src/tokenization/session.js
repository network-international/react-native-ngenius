const {
  NATIVE_CAPTURE_DEMO,
  REAL_TOKENIZATION_API,
} = require('./captureModes');

const createTokenizationSession = () => {
  let inFlight = false;
  let successEmitted = false;
  let errorEmitted = false;
  let cancelEmitted = false;

  return {
    start() {
      inFlight = false;
      successEmitted = false;
      errorEmitted = false;
      cancelEmitted = false;
    },
    tryBeginNative() {
      if (inFlight || successEmitted || cancelEmitted) {
        return false;
      }
      inFlight = true;
      errorEmitted = false;
      return true;
    },
    endNative() {
      inFlight = false;
    },
    isInFlight() {
      return inFlight;
    },
    emitSuccess(callback, payload) {
      if (successEmitted || cancelEmitted) {
        return false;
      }
      successEmitted = true;
      inFlight = false;
      if (callback) {
        callback(payload);
      }
      return true;
    },
    emitError(callback, payload) {
      if (errorEmitted || successEmitted || cancelEmitted) {
        return false;
      }
      errorEmitted = true;
      inFlight = false;
      if (callback) {
        callback(payload);
      }
      return true;
    },
    emitCancel(callback) {
      if (inFlight || cancelEmitted) {
        return false;
      }
      cancelEmitted = true;
      if (callback) {
        callback();
      }
      return true;
    },
  };
};

const pocNativeResult = ({ method, status }) => ({
  flow: 'TOKENIZATION',
  method,
  status,
  niTokenCreated: false,
  savedToken: null,
  capture: NATIVE_CAPTURE_DEMO,
});

const pocErrorResult = (error) => {
  const status = error && error.status ? error.status : 'Failed';
  let message;
  if (error && typeof error.error === 'string') {
    message = error.error;
  } else if (error && typeof error.message === 'string') {
    message = error.message;
  } else if (typeof status === 'string') {
    message = status;
  } else {
    message = 'Failed';
  }
  return {
    flow: 'TOKENIZATION',
    status,
    error: message,
    niTokenCreated: false,
    savedToken: null,
    capture: NATIVE_CAPTURE_DEMO,
  };
};

const savedTokenResult = ({ method, savedToken }) => ({
  flow: 'TOKENIZATION',
  method,
  status: 'VERIFIED',
  niTokenCreated: true,
  savedToken: {
    tokenRef: savedToken.tokenRef,
    type: savedToken.type,
    walletType: savedToken.walletType,
    status: savedToken.status,
    cardDetails: savedToken.cardDetails,
  },
  capture: REAL_TOKENIZATION_API,
});

const THREE_DS_CONTINUATION_UNAVAILABLE = 'THREE_DS_CONTINUATION_UNAVAILABLE';

// AWAIT_3DS is unverified; with no native 3DS runner, do not expose it as a saved token.
const awaitingThreeDSResult = ({ method }) => ({
  flow: 'TOKENIZATION',
  method,
  status: 'AWAIT_3DS',
  code: THREE_DS_CONTINUATION_UNAVAILABLE,
  error: '3DS verification is required and is not available yet',
  niTokenCreated: false,
  savedToken: null,
  capture: REAL_TOKENIZATION_API,
});

const apiErrorResult = ({ method, error }) => ({
  flow: 'TOKENIZATION',
  method,
  status: 'FAILED',
  code: error && typeof error.code === 'string' ? error.code : 'UNKNOWN_ERROR',
  error: error && typeof error.message === 'string' ? error.message : 'Failed',
  niTokenCreated: false,
  savedToken: null,
  capture: REAL_TOKENIZATION_API,
});

module.exports = {
  createTokenizationSession,
  pocNativeResult,
  pocErrorResult,
  savedTokenResult,
  awaitingThreeDSResult,
  apiErrorResult,
  THREE_DS_CONTINUATION_UNAVAILABLE,
};
