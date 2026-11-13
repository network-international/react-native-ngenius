import { NativeModules, DeviceEventEmitter } from 'react-native';
const { cardContextFor } = require('./cardContext');
const { serializeConsentData } = require('./consentData');
const { parseSavedTokensResponse } = require('./api/models');
const { validReference } = require('./api/endpoints');
const { validateUsageType } = require('./usageType');
const { VERIFICATION_STATES } = require('./verificationStates');
const { apiErrorResult } = require('./session');
let counter = 0;
const failure = (code, message = 'Card could not be saved') => ({
  state: VERIFICATION_STATES.FAILED,
  result: apiErrorResult({
    method: 'CARD',
    error: { code, message },
  }),
});

export const startNativeCardTokenization = ({
  client,
  outletRef,
  sessionRef,
  usageType,
  getConsentData,
  presentation,
  isCurrent = () => true,
  onVerifying,
}) => {
  const native = NativeModules.NiSdk;
  const context = cardContextFor(client);
  const requestId = `card-${Date.now()}-${++counter}`;
  let terminal = false;
  let submitting = false;
  let settle;
  let subscription;
  const promise = new Promise(resolve => {
    settle = resolve;
  });
  const finish = outcome => {
    if (!terminal) {
      terminal = true;
      subscription?.remove();
      settle(outcome);
    }
  };
  const cancel = () => {
    if (terminal) return;
    try {
      native?.cancelTokenizationCard?.(requestId);
    } catch {
      /* The host may have disposed its bridge. */
    }
    finish({ state: VERIFICATION_STATES.READY });
  };
  try {
    validateUsageType(usageType);
  } catch (error) {
    finish(failure(error.code, error.message));
    return { promise, cancel };
  }
  if (!validReference(sessionRef)) {
    finish(failure('INVALID_SESSION_REF', 'Session reference is required'));
    return { promise, cancel };
  }
  if (
    !context ||
    typeof outletRef !== 'string' ||
    !outletRef.trim() ||
    ![
      'presentTokenizationCard',
      'submitTokenizationCard',
      'failTokenizationCard',
      'cancelTokenizationCard',
    ].every(name => typeof native?.[name] === 'function') ||
    !isCurrent()
  ) {
    finish(failure('NATIVE_CARD_UNAVAILABLE'));
    return { promise, cancel };
  }
  try {
    // Native owns card inputs and the HTTP body. Ready/result callbacks contain no PAN/CVV.
    subscription = DeviceEventEmitter.addListener(
      'NiTokenizationCardReady',
      async event => {
        const id = event?.requestId;
        if (terminal || submitting || id !== requestId) return;
        submitting = true;
        if (!isCurrent()) {
          cancel();
          return;
        }
        try {
          const { url, accessToken } = await context.prepareRequest({ outletRef, sessionRef });
          if (terminal || !isCurrent()) {
            cancel();
            return;
          }
          const consentData = serializeConsentData(getConsentData());
          onVerifying?.();
          native.submitTokenizationCard(requestId, {
            url,
            accessToken,
            sessionRef,
            usageType,
            consentData,
          });
        } catch {
          try {
            native.failTokenizationCard(requestId);
          } catch {
            finish(failure('NATIVE_CARD_UNAVAILABLE'));
          }
        }
      },
    );
    native.presentTokenizationCard(
      { ...presentation, requestId },
      (status, response) => {
        if (terminal) return;
        if (status === 'Aborted') {
          finish({ state: VERIFICATION_STATES.READY });
          return;
        }
        if (status !== 'Response') {
          finish(failure('NATIVE_CARD_REQUEST_FAILED'));
          return;
        }
        try {
          finish({
            state: VERIFICATION_STATES.SUCCESS,
            updatedTokenList: parseSavedTokensResponse(response),
          });
        } catch {
          finish(failure('MALFORMED_RESPONSE'));
        }
      },
    );
  } catch {
    finish(failure('NATIVE_CARD_UNAVAILABLE'));
  }
  return { promise, cancel };
};
