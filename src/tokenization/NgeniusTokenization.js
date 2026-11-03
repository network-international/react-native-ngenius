import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Platform, Dimensions } from 'react-native';
import TokenizationScreen from './ui/TokenizationScreen';
import { captureApplePayToken } from './nativeWallets';
import { startNativeCardTokenization } from './nativeCards';
const { mapNativeCardColors } = require('./mapNativeCardColors');
import {
  initiateGooglePay,
  isApplePaySupported,
  isGooglePaySupported,
} from '../nativePayments';

const { buildConsentData } = require('./consentData');
const { resolveTokenizationTheme } = require('./resolveTheme');
const { getTokenizationMethods } = require('./supportedMethods');
const { t } = require('./strings');
const { resolveConsentInformation } = require('./consentInformation');
const { createTokenizationSession, pocErrorResult } = require('./session');
const { VERIFICATION_STATES } = require('./verificationStates');
const {
  runGooglePayTokenization,
  runWalletTokenization,
} = require('./walletTokenization');
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
  skipConsent = false,
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
  const [savedTokens, setSavedTokens] = useState({
    loading: false,
    tokens: [],
    failed: false,
  });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const consent = resolveConsentInformation({
    skipConsent,
    order,
    tncUrl: tnc.url,
  });
  const consentDiagnostic = tnc.loaded ? consent?.diagnostic : undefined;
  useEffect(() => {
    if (visible && consentDiagnostic) {
      console.info('[TOKENIZATION_CONSENT]', { code: consentDiagnostic });
    }
  }, [visible, consentDiagnostic]);
  const theme = useMemo(
    () => resolveTokenizationTheme(branding, { language }),
    [branding, language],
  );
  const [consentAccepted, setConsentAccepted] = useState(false);
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
  const [, setSessionNonce] = useState(0);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onCancelRef = useRef(onCancel);
  const nativeGateRef = useRef(null);
  const nativeCardCancelRef = useRef(null);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!visible) {
      nativeCardCancelRef.current?.();
      nativeCardCancelRef.current = null;
      sessionRef.current.close();
      setConsentAccepted(false);
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
      setConsentAccepted(false);
      sessionOrderRef.current = order;
      setStatus(VERIFICATION_STATES.READY);
      setErrorMessage(undefined);
      setTokenSaved(false);
      setHideForNative(false);
      setSessionNonce(n => n + 1);
    } else if (!sessionOrderRef.current && order) {
      sessionOrderRef.current = order;
      setSessionNonce(n => n + 1);
    }
    wasVisibleRef.current = true;
  }, [visible, order]);

  useEffect(
    () => () => {
      nativeCardCancelRef.current?.();
      nativeCardCancelRef.current = null;
      sessionRef.current.close();
      wasVisibleRef.current = false;
      nativeGateRef.current = null;
    },
    [],
  );

  // Request in both consent modes; inline clients cannot cause refetch loops.
  useEffect(() => {
    if (!visible) {
      setTnc({ loaded: false, url: undefined });
      return undefined;
    }
    setTnc({ loaded: false, url: undefined });
    let cancelled = false;
    const generation = sessionRef.current.generation();
    const client = tokenizationClientRef.current;
    if (!client || !outletRef) {
      setSavedTokens({ loading: false, tokens: [], failed: true });
      return undefined;
    }
    setSavedTokens({ loading: true, tokens: [], failed: false });
    Promise.resolve()
      .then(() => client.getSavedTokens({ outletRef, skipConsent }))
      .then(response => {
        if (!cancelled && sessionRef.current.isCurrent(generation)) {
          setTnc({ loaded: true, url: response.tncUrl });
          setSavedTokens({
            loading: false,
            tokens: response.tokens,
            page: response.page,
            failed: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled && sessionRef.current.isCurrent(generation)) {
          setTnc({ loaded: true, url: undefined });
          setSavedTokens({ loading: false, tokens: [], failed: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, outletRef, skipConsent, refreshNonce]);

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
            googlePayConfig || { environment: 'PRODUCTION' },
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

  const methods = getTokenizationMethods(sessionOrderRef.current, {
    paymentMethods,
    platform: Platform.OS,
    applePaySupported,
    googlePaySupported,
  });

  const finishSuccess = useCallback(result => {
    setStatus(VERIFICATION_STATES.SUCCESS);
    sessionRef.current.emitSuccess(onSuccessRef.current, result);
  }, []);

  const finishError = useCallback(
    error => {
      const payload = pocErrorResult(error);
      setErrorMessage(payload.error || t(language, 'VERIFICATION_FAILED'));
      setStatus(VERIFICATION_STATES.FAILED);
      sessionRef.current.emitError(onErrorRef.current, payload);
    },
    [language],
  );

  const applyWalletOutcome = useCallback(
    ({ state, result }) => {
      if (state === VERIFICATION_STATES.READY) {
        sessionRef.current.endNative();
        sessionRef.current.setAccepted(false);
        setConsentAccepted(false);
        setStatus(VERIFICATION_STATES.READY);
        return;
      }
      if (state === VERIFICATION_STATES.SUCCESS) {
        setTokenSaved(true);
        setRefreshNonce(value => value + 1);
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
    [finishSuccess, language],
  );

  const handleDismiss = useCallback(() => {
    if (sessionRef.current.emitCancel(onCancelRef.current)) {
      setConsentAccepted(false);
      setTnc({ loaded: false, url: undefined });
    }
  }, []);

  const restoreRnModal = useCallback(() => {
    nativeGateRef.current = null;
    setHideForNative(false);
  }, []);

  const runAfterRnModalHidden = useCallback(startNative => {
    if (Platform.OS !== 'ios') {
      startNative();
      return;
    }
    nativeGateRef.current = createNativePresentationGate(startNative);
    setHideForNative(true);
  }, []);

  const onSelectMethod = useCallback(
    async method => {
      if (!visible || !sessionRef.current.canProceed(skipConsent)) return;
      const generation = sessionRef.current.generation();
      const isCurrent = () => sessionRef.current.isCurrent(generation);
      const acceptedAt = sessionRef.current.acceptanceTimestamp();
      const getConsentData = () =>
        buildConsentData({
          skipConsent,
          accepted: consentAccepted,
          acceptedAt,
          tncUrl: consent?.url,
          language,
          platform: Platform.OS,
          osVersion: Platform.Version,
          screen: Dimensions.get('screen'),
        });
      const activeOrder = sessionOrderRef.current || order;
      if (!sessionRef.current.tryBeginNative()) {
        return;
      }
      if (!activeOrder && method !== 'CARD') {
        finishError({ status: 'Error', error: 'Order not found' });
        return;
      }
      setStatus(VERIFICATION_STATES.SUBMITTING);
      setErrorMessage(undefined);
      if (method === 'CARD') {
        runAfterRnModalHidden(async () => {
          if (!isCurrent()) return;
          const attempt = startNativeCardTokenization({
            client: tokenizationClient,
            outletRef,
            getConsentData,
            isCurrent,
            onVerifying: () => {
              if (isCurrent()) setStatus(VERIFICATION_STATES.VERIFYING);
            },
            presentation: {
              colors: mapNativeCardColors(theme),
              rtl: language.toLowerCase().startsWith('ar'),
              labels: {
                title: t(language, 'ADD_CARD'),
                pan: t(language, 'CARD_NUMBER'),
                expiry: t(language, 'CARD_EXPIRY'),
                cvv: t(language, 'CARD_CVV'),
                name: t(language, 'CARDHOLDER_NAME'),
                submit: t(language, 'ADD_CARD'),
                cancel: t(language, 'CANCEL'),
                invalid: t(language, 'CARD_INPUT_INVALID'),
              },
            },
          });
          nativeCardCancelRef.current = attempt.cancel;
          const outcome = await attempt.promise;
          if (isCurrent()) {
            nativeCardCancelRef.current = null;
            restoreRnModal();
            applyWalletOutcome(outcome);
          }
        });
        return;
      }
      if (method === 'APPLE_PAY' && tokenizationClient && outletRef) {
        runAfterRnModalHidden(async () => {
          const outcome = await runWalletTokenization({
            method: 'APPLE_PAY',
            client: tokenizationClient,
            outletRef,
            order: activeOrder,
            googlePayConfig: applePayConfig,
            captureWallet: captureApplePayToken,
            getConsentData,
            isCurrent,
            onVerifying: () => {
              if (isCurrent()) setStatus(VERIFICATION_STATES.VERIFYING);
            },
          });
          if (isCurrent()) {
            restoreRnModal();
            applyWalletOutcome(outcome);
          }
        });
        return;
      }
      if (method === 'GOOGLE_PAY' && tokenizationClient && outletRef) {
        const outcome = await runGooglePayTokenization({
          client: tokenizationClient,
          outletRef,
          order: activeOrder,
          googlePayConfig,
          initiateGooglePay,
          getConsentData,
          isCurrent,
          onVerifying: () => {
            if (isCurrent()) setStatus(VERIFICATION_STATES.VERIFYING);
          },
        });
        if (isCurrent()) applyWalletOutcome(outcome);
        return;
      }
      finishError({
        status: 'Error',
        error: 'Tokenization client and outlet are required',
      });
    },
    [
      visible,
      skipConsent,
      language,
      consentAccepted,
      consent?.url,
      theme,
      order,
      applePayConfig,
      googlePayConfig,
      tokenizationClient,
      outletRef,
      finishError,
      applyWalletOutcome,
      restoreRnModal,
      runAfterRnModalHidden,
    ],
  );

  const renderedGeneration = sessionRef.current.generation();
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
      }}>
      <TokenizationScreen
        theme={theme}
        language={language}
        consent={consent}
        consentAccepted={consentAccepted}
        onConsentChange={accepted => {
          if (
            sessionRef.current.setAccepted(
              accepted,
              () => new Date(),
              renderedGeneration,
            )
          ) {
            setConsentAccepted(accepted);
          }
        }}
        savedTokens={savedTokens}
        onRetrySavedTokens={() => setRefreshNonce(value => value + 1)}
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
