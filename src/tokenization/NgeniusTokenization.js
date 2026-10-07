import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
const { TokenizationBootstrapContext, readResolvedTncUrl } = require('./TokenizationBootstrapContext');
const { resolveConsentInformation } = require('./consentInformation');
const {
  createTokenizationSession,
  pocNativeResult,
  pocErrorResult,
} = require('./session');
const {
  createNativePresentationGate,
  RN_MODAL_DISMISS_MS,
} = require('./nativePresentation');

// Native CARD / Apple Pay / Google Pay stay on the NISdk capture screens.
// Do not call createCardPaymentMethod or createWalletPaymentMethod from this
// component: CreateCardRequest needs PAN/CVV that NISdk does not expose to JS,
// and wallet RN results are not CreateWalletRequest (dan / cryptogram).
const FLOW = 'TOKENIZATION';

const NgeniusTokenization = ({
  visible = false,
  order,
  paymentMethods,
  branding,
  language = 'en',
  consentOff = false,
  applePayConfig,
  googlePayConfig,
  onSuccess,
  onError,
  onCancel,
}) => {
  const bootstrap = useContext(TokenizationBootstrapContext);
  const previousVisibility = useRef(false);
  const retiredBootstrap = useRef(null);
  const latestBootstrap = useRef(null);
  // Reusing the component/order must not reuse a completed init session's URL.
  // The internal adapter supplies a fresh context value for every new init.
  if (!visible && previousVisibility.current) retiredBootstrap.current = latestBootstrap.current;
  if (visible) latestBootstrap.current = bootstrap;
  previousVisibility.current = visible;
  const resolvedTncUrl = readResolvedTncUrl({
    bootstrap: bootstrap === retiredBootstrap.current ? null : bootstrap,
    order, visible, consentOff,
  });
  const consent = resolveConsentInformation({ consentOff, order, bootstrap: { resolvedTncUrl } });
  const consentDiagnostic = consent?.diagnostic;
  useEffect(() => {
    if (visible && consentDiagnostic) {
      // Informational log only: no shopper error, URL, order data or credentials.
      console.info('[TOKENIZATION_CONSENT]', { code: consentDiagnostic });
    }
  }, [visible, consentDiagnostic]);
  const theme = useMemo(
    () => resolveTokenizationTheme(branding, { language }),
    [branding, language]
  );
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState(undefined);
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
      setStatus('idle');
      setErrorMessage(undefined);
      setHideForNative(false);
      nativeGateRef.current = null;
      return;
    }
    if (!wasVisibleRef.current) {
      sessionRef.current.start();
      sessionOrderRef.current = order;
      setStatus('idle');
      setErrorMessage(undefined);
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
    setStatus('success');
    sessionRef.current.emitSuccess(onSuccessRef.current, result);
  }, []);

  const finishError = useCallback(
    (error) => {
      const payload = pocErrorResult(error);
      setErrorMessage(payload.error || t(language, 'VERIFICATION_FAILED'));
      setStatus('error');
      sessionRef.current.emitError(onErrorRef.current, payload);
    },
    [language]
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
          setStatus('idle');
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
      setStatus('loading');
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
            setStatus('idle');
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
      finishSuccess,
      finishError,
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
        errorMessage={errorMessage}
        onSelectMethod={onSelectMethod}
        onCancel={handleDismiss}
      />
    </Modal>
  );
};

export default NgeniusTokenization;
export { FLOW };
