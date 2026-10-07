const { createIdempotencyStore } = require('./api/idempotency');
const {
  NATIVE_CAPTURE_DEMO,
  REAL_TOKENIZATION_API,
} = require('./captureModes');

/**
 * Per-modal session flags. Extracted so reopen / double-callback
 * behaviour can be unit-tested without rendering React Native views.
 */
const createTokenizationSession = () => {
  let inFlight = false;
  let successEmitted = false;
  let errorEmitted = false;
  let cancelEmitted = false;
  const idempotency = createIdempotencyStore();

  return {
    start() {
      inFlight = false;
      successEmitted = false;
      errorEmitted = false;
      cancelEmitted = false;
      idempotency.reset();
    },
    idempotencyKeyFor(operationId) {
      return idempotency.getOrCreate(operationId);
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
  paymentMethod: null,
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
    paymentMethod: null,
    capture: NATIVE_CAPTURE_DEMO,
  };
};

const paymentMethodCreatedResult = (paymentMethod) => ({
  flow: 'TOKENIZATION',
  niTokenCreated: true,
  paymentMethod,
  capture: REAL_TOKENIZATION_API,
});

module.exports = {
  createTokenizationSession,
  pocNativeResult,
  pocErrorResult,
  paymentMethodCreatedResult,
};
