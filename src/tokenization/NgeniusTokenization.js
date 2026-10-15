import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform } from 'react-native';
import TokenizationScreen from './ui/TokenizationScreen';
import { withNativeCardTheme } from './applyNativeCardTheme';
import {
  initiateCardPayment,
  initiateApplePay,
  initiateGooglePay,
  isApplePaySupported,
  isGooglePaySupported,
} from '../nativePayments';

const { resolveTokenizationTheme } = require('./resolveTheme');
const { getTokenizationMethods } = require('./supportedMethods');
const { mapNativeCardColors } = require('./mapNativeCardColors');
const { t } = require('./strings');
const { resolveConsentInformation, loadTncUrl } = require('./consentInformation');
const {
  createTokenizationSession,
  pocNativeResult,
  pocErrorResult,
} = require('./session');
const { VERIFICATION_STATES } = require('./verificationStates');
const { runGooglePayTokenization } = require('./walletTokenization');
const {
  createNativePresentationGate,
  RN_MODAL_DISMISS_MS,
} = require('./nativePresentation');

// Card capture stays native so PAN/CVV never cross the React Native bridge.
const FLOW = 'TOKENIZATION';

const NgeniusTokenization = ({
  visible = false,
  order,
  paymentMethods,
  branding,
  language = 'en',
  consentOff = false,
  tokenizationClient,
  outletRef,
  applePayConfig,
  googlePayConfig,
  onSuccess,
  onError,
  onCancel,
}) => {
  const tokenizationClientRef = useRef(tokenizationClient);
  tokenizationClientRef.current = tokenizationClient;
  const [tnc, setTnc] = useState({ loaded: false, url: undefined });
  // Keyed on open/outlet/consent only, so an inline client cannot cause refetch loops.
  useEffect(() => {
    if (!visible) {
      setTnc({ loaded: false, url: undefined });
      return undefined;
    }
    let cancelled = false;
    loadTncUrl({ client: tokenizationClientRef.current, outletRef, consentOff }).then((url) => {
      if (!cancelled) {
        setTnc({ loaded: true, url });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, outletRef, consentOff]);
  const consent = resolveConsentInformation({ consentOff, order, tncUrl: tnc.url });
  const consentDiagnostic = tnc.loaded ? consent?.diagnostic : undefined;
  useEffect(() => {
    if (visible && consentDiagnostic) {
      console.info('[TOKENIZATION_CONSENT]', { code: consentDiagnostic });
    }
  }, [visible, consentDiagnostic]);
  const theme = useMemo(
    () => resolveTokenizationTheme(branding, { language }),
    [branding, language]
  );
  const [status, setStatus] = useState(VERIFICATION_STATES.READY);
  const [errorMessage, setErrorMessage] = useState(undefined);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [applePaySupported, setApplePaySupported] = useState(false);
  const [googlePaySupported, setGooglePaySupported] = useState(false);
  const [hideForNative, setHideForNative] = useState(false);

  const sessionRef = useRef(null);
  if (sessionRef.current == null) {
    sessionRef.current = createTokenizationSession();
  }
  const wasVisibleRef = useRef(false);
  const sessionOrderRef = useRef(order);
  const [sessionNonce, setSessionNonce] = useState(0);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onCancelRef = useRef(onCancel);
  const nativeGateRef = useRef(null);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      setStatus(VERIFICATION_STATES.READY);
      setErrorMessage(undefined);
      setTokenSaved(false);
      setHideForNative(false);
      nativeGateRef.current = null;
      return;
    }
    if (!wasVisibleRef.current) {
      sessionRef.current.start();
      sessionOrderRef.current = order;
      setStatus(VERIFICATION_STATES.READY);
      setErrorMessage(undefined);
      setTokenSaved(false);
      setHideForNative(false);
      setSessionNonce((n) => n + 1);
    } else if (!sessionOrderRef.current && order) {
      sessionOrderRef.current = order;
      setSessionNonce((n) => n + 1);
    }
    wasVisibleRef.current = true;
  }, [visible, order]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;
    const loadWalletSupport = async () => {
      if (Platform.OS === 'ios') {
        try {
          const supported = await isApplePaySupported();
          if (!cancelled) {
            setApplePaySupported(Boolean(supported));
          }
        } catch {
          if (!cancelled) {
            setApplePaySupported(false);
          }
        }
      }
      if (Platform.OS === 'android') {
        try {
          const supported = await isGooglePaySupported(
            googlePayConfig || { environment: 'PRODUCTION' }
          );
          if (!cancelled) {
            setGooglePaySupported(Boolean(supported));
          }
        } catch {
          if (!cancelled) {
            setGooglePaySupported(false);
          }
        }
      }
    };
    loadWalletSupport();
    return () => {
      cancelled = true;
    };
  }, [visible, googlePayConfig]);

  useEffect(() => {
    if (!hideForNative || Platform.OS !== 'ios') {
      return undefined;
    }
    const timer = setTimeout(() => {
      if (nativeGateRef.current) {
        nativeGateRef.current.start();
      }
    }, RN_MODAL_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [hideForNative]);

  const methods = useMemo(
    () =>
      getTokenizationMethods(sessionOrderRef.current, {
        paymentMethods,
        platform: Platform.OS,
        applePaySupported,
        googlePaySupported,
      }),
    [sessionNonce, paymentMethods, applePaySupported, googlePaySupported]
  );

  const finishSuccess = useCallback((result) => {
    setStatus(VERIFICATION_STATES.SUCCESS);
    sessionRef.current.emitSuccess(onSuccessRef.current, result);
  }, []);

  const finishError = useCallback(
    (error) => {
      const payload = pocErrorResult(error);
      setErrorMessage(payload.error || t(language, 'VERIFICATION_FAILED'));
      setStatus(VERIFICATION_STATES.FAILED);
      sessionRef.current.emitError(onErrorRef.current, payload);
    },
    [language]
  );

  const applyWalletOutcome = useCallback(
    ({ state, result }) => {
      if (state === VERIFICATION_STATES.READY) {
        sessionRef.current.endNative();
        setStatus(VERIFICATION_STATES.READY);
        return;
      }
      if (state === VERIFICATION_STATES.SUCCESS) {
        setTokenSaved(true);
        finishSuccess(result);
        return;
      }
      if (state === VERIFICATION_STATES.AWAITING_3DS) {
        setStatus(VERIFICATION_STATES.AWAITING_3DS);
      } else {
        setErrorMessage(t(language, 'TOKEN_SAVE_FAILED'));
        setStatus(VERIFICATION_STATES.FAILED);
      }
      sessionRef.current.emitError(onErrorRef.current, result);
    },
    [finishSuccess, language]
  );

  const handleDismiss = useCallback(() => {
    sessionRef.current.emitCancel(onCancelRef.current);
  }, []);

  const restoreRnModal = useCallback(() => {
    nativeGateRef.current = null;
    setHideForNative(false);
  }, []);

  const completeNativeAttempt = useCallback(
    async (method, runNative) => {
      try {
        const response = await runNative();
        finishSuccess(
          pocNativeResult({
            method,
            status: response && response.status ? response.status : 'Success',
          })
        );
      } catch (error) {
        if (error && error.status === 'Aborted') {
          sessionRef.current.endNative();
          setStatus(VERIFICATION_STATES.READY);
        } else {
          finishError(error || { status: 'Failed' });
        }
      } finally {
        restoreRnModal();
      }
    },
    [finishSuccess, finishError, restoreRnModal]
  );

  const runAfterRnModalHidden = useCallback((startNative) => {
    if (Platform.OS !== 'ios') {
      startNative();
      return;
    }
    nativeGateRef.current = createNativePresentationGate(startNative);
    setHideForNative(true);
  }, []);

  const onSelectMethod = useCallback(
    async (method) => {
      const activeOrder = sessionOrderRef.current || order;
      if (!sessionRef.current.tryBeginNative()) {
        return;
      }
      if (!activeOrder) {
        finishError({ status: 'Error', error: 'Order not found' });
        return;
      }
      setStatus(VERIFICATION_STATES.SUBMITTING);
      setErrorMessage(undefined);
      if (method === 'CARD') {
        runAfterRnModalHidden(() =>
          completeNativeAttempt(method, () =>
            withNativeCardTheme(mapNativeCardColors(theme), () =>
              initiateCardPayment(activeOrder)
            )
          )
        );
        return;
      }
      if (method === 'APPLE_PAY') {
        runAfterRnModalHidden(() =>
          completeNativeAttempt(method, () =>
            initiateApplePay(activeOrder, applePayConfig)
          )
        );
        return;
      }
      if (method === 'GOOGLE_PAY' && tokenizationClient && outletRef) {
        applyWalletOutcome(
          await runGooglePayTokenization({
            client: tokenizationClient,
            outletRef,
            order: activeOrder,
            googlePayConfig,
            initiateGooglePay,
            onVerifying: () => setStatus(VERIFICATION_STATES.VERIFYING),
          })
        );
        return;
      }
      if (method === 'GOOGLE_PAY') {
        try {
          const response = await initiateGooglePay(activeOrder, googlePayConfig);
          finishSuccess(
            pocNativeResult({
              method,
              status: response && response.status ? response.status : 'Success',
            })
          );
        } catch (error) {
          if (error && error.status === 'Aborted') {
            sessionRef.current.endNative();
            setStatus(VERIFICATION_STATES.READY);
            return;
          }
          finishError(error || { status: 'Failed' });
        }
        return;
      }
      finishError({ status: 'Error', error: 'Unsupported method' });
    },
    [
      order,
      theme,
      applePayConfig,
      googlePayConfig,
      tokenizationClient,
      outletRef,
      finishSuccess,
      finishError,
      applyWalletOutcome,
      completeNativeAttempt,
      runAfterRnModalHidden,
    ]
  );

  return (
    <Modal
      visible={Boolean(visible) && !hideForNative}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleDismiss}
      onDismiss={() => {
        if (nativeGateRef.current) {
          nativeGateRef.current.onDismiss();
        }
      }}
    >
      <TokenizationScreen
        theme={theme}
        language={language}
        order={order}
        consent={consent}
        methods={methods}
        status={status}
        tokenSaved={tokenSaved}
        errorMessage={errorMessage}
        onSelectMethod={onSelectMethod}
        onCancel={handleDismiss}
      />
    </Modal>
  );
};

export default NgeniusTokenization;
export { FLOW };
