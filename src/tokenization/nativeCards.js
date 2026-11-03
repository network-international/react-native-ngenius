import { NativeModules, DeviceEventEmitter } from 'react-native';
const { cardContextFor } = require('./cardContext');
const { serializeConsentData } = require('./consentData');
const { parseSavedCardResponse } = require('./api/models');
const {
  stateForSavedToken,
  VERIFICATION_STATES,
} = require('./verificationStates');
const {
  savedTokenResult,
  awaitingThreeDSResult,
  apiErrorResult,
} = require('./session');
let counter = 0;
const failure = code => ({
  state: VERIFICATION_STATES.FAILED,
  result: apiErrorResult({
    method: 'CARD',
    error: { code, message: 'Card could not be saved' },
  }),
});

export const startNativeCardTokenization = ({
  client,
  outletRef,
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
          const request = await context.prepareRequest(outletRef);
          if (terminal || !isCurrent()) {
            cancel();
            return;
          }
          const consentData = serializeConsentData(getConsentData());
          onVerifying?.();
          native.submitTokenizationCard(requestId, { ...request, consentData });
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
          const savedToken = parseSavedCardResponse(response);
          if (savedToken.type !== 'CARD')
            throw new Error('Unexpected token type');
          const state = stateForSavedToken(savedToken);
          finish(
            state === VERIFICATION_STATES.SUCCESS
              ? {
                  state,
                  result: savedTokenResult({ method: 'CARD', savedToken }),
                }
              : state === VERIFICATION_STATES.AWAITING_3DS
              ? { state, result: awaitingThreeDSResult({ method: 'CARD' }) }
              : failure('CARD_VERIFICATION_FAILED'),
          );
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
