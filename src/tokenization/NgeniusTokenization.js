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
const { createTokenizationSession, apiErrorResult } = require('./session');
const { invalidUsageType, validateUsageType } = require('./usageType');
const { validReference } = require('./api/endpoints');
const { isWalletTokenizationAvailable, walletBackendPendingError } = require('./api/addWallet');
const { VERIFICATION_STATES } = require('./verificationStates');
const { savedPaymentMethodSelection, defaultSelectedTokenRef } = require('./savedPaymentMethodSelection');
const { resolveModeConfig } = require('./modeConfig');
const { walletTokenizationOrder } = require('./walletTokenizationOrder');
const { normalizeOrderDetails } = require('./orderDetails');
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
  order: legacyOrder,
  orderDetails,
  paymentMethods,
  branding,
  language: languageProp,
  skipConsent = false,
  tokenizationClient,
  outletRef,
  applePayConfig,
  googlePayConfig,
  onError,
  onCancel,
  advisedTokens,
  getUsageType,
  modeConfig,
  onSelectionComplete,
}) => {
  // Explicit details never merge with or silently fall back to a legacy order.
  const suppliedOrder = orderDetails == null ? legacyOrder : orderDetails;
  const order = suppliedOrder && typeof suppliedOrder === 'object' && !Array.isArray(suppliedOrder)
    ? suppliedOrder : undefined;
  const language = [languageProp, orderDetails?.language, legacyOrder?.language]
    .map(value => typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : undefined)
    .find(value => ['en', 'fr', 'ar'].includes(value)) || 'en';
  const tokenizationClientRef = useRef(tokenizationClient);
  tokenizationClientRef.current = tokenizationClient;
  const [tnc, setTnc] = useState({ loaded: false, url: undefined });
  const [savedTokens, setSavedTokens] = useState({
    loading: true,
    tokens: [],
    failed: false,
  });
  const [tokenizationSessionRef, setTokenizationSessionRef] = useState(null);
  const backendSessionRef = useRef(null);
  const advisedTokensRef = useRef(advisedTokens);
  advisedTokensRef.current = advisedTokens;
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedTokenRef, setSelectedTokenRef] = useState(null);
  const [selectionStatus, setSelectionStatus] = useState('idle');
  const [selectionError, setSelectionError] = useState(undefined);
  const [selectionClosed, setSelectionClosed] = useState(false);
  const selectionAttemptRef = useRef(null);
  const selectionTimerRef = useRef(null);
  const selectionCounterRef = useRef(0);
  const onSelectionCompleteRef = useRef(onSelectionComplete);
  onSelectionCompleteRef.current = onSelectionComplete;
  const resolvedModeConfig = useMemo(() => resolveModeConfig(modeConfig, language), [modeConfig, language]);
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
  const presentationSource = sessionOrderRef.current;
  const presentationOrder = useMemo(() => normalizeOrderDetails({
    order: presentationSource, language,
  }), [presentationSource, language]);
  const consent = resolveConsentInformation({
    skipConsent,
    order: presentationSource,
    tncUrl: tnc.url,
  });
  const consentDiagnostic = tnc.loaded ? consent?.diagnostic : undefined;
  useEffect(() => {
    if (visible && consentDiagnostic) {
      console.info('[TOKENIZATION_CONSENT]', { code: consentDiagnostic });
    }
  }, [visible, consentDiagnostic]);
  const [, setSessionNonce] = useState(0);
  const onErrorRef = useRef(onError);
  const onCancelRef = useRef(onCancel);
  const nativeGateRef = useRef(null);
  const nativeCardCancelRef = useRef(null);
  const previousOutletRef = useRef(outletRef);
  onErrorRef.current = onError;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!visible) {
      setSelectedTokenRef(null);
      selectionAttemptRef.current = null;
      clearTimeout(selectionTimerRef.current);
      setSelectionStatus('idle');
      setSelectionError(undefined);
      setSelectionClosed(false);
      nativeCardCancelRef.current?.();
      nativeCardCancelRef.current = null;
      sessionRef.current.close();
      backendSessionRef.current = null;
      setTokenizationSessionRef(null);
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
      setSelectedTokenRef(null);
      selectionAttemptRef.current = null;
      clearTimeout(selectionTimerRef.current);
      setSelectionStatus('idle');
      setSelectionError(undefined);
      setSelectionClosed(false);
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
      selectionAttemptRef.current = null;
      clearTimeout(selectionTimerRef.current);
      nativeCardCancelRef.current = null;
      sessionRef.current.close();
      wasVisibleRef.current = false;
      nativeGateRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (previousOutletRef.current === outletRef) return;
    previousOutletRef.current = outletRef;
    backendSessionRef.current = null;
    setTokenizationSessionRef(null);
    selectionAttemptRef.current = null;
    clearTimeout(selectionTimerRef.current);
    nativeCardCancelRef.current?.();
    nativeCardCancelRef.current = null;
    nativeGateRef.current = null;
    sessionRef.current.close();
    if (visible) sessionRef.current.start();
    sessionOrderRef.current = order;
    setSessionNonce(n => n + 1);
    setHideForNative(false);
    setStatus(VERIFICATION_STATES.READY);
    setErrorMessage(undefined);
    setTokenSaved(false);
    setConsentAccepted(false);
    setSelectionClosed(false);
    setSelectedTokenRef(null);
    setSelectionStatus('idle');
    setSelectionError(undefined);
  }, [outletRef, visible, order]);

  // Reuse the created backend session for retries and consent-mode changes.
  useEffect(() => {
    if (!visible) {
      setTnc({ loaded: false, url: undefined });
      return undefined;
    }
    const generation = sessionRef.current.generation();
    let cancelled = false;
    const isCurrent = () => !cancelled && sessionRef.current.isCurrent(generation);
    let journey = backendSessionRef.current;
    if (journey?.generation !== generation) {
      setTnc({ loaded: false, url: undefined });
      const client = tokenizationClientRef.current;
      if (!client || !outletRef) {
        setSavedTokens({ loading: false, tokens: [], failed: true });
        return undefined;
      }
      const advised = advisedTokensRef.current;
      journey = {
        client,
        generation,
        advisedTokens: Array.isArray(advised) ? Array.from(advised) : advised,
        listRevision: 0,
      };
      backendSessionRef.current = journey;
    }
    setSavedTokens({ loading: true, tokens: [], failed: false });
    const { client } = journey;
    if (!journey.creation) {
      journey.creation = Promise.resolve()
        .then(() => {
          if (!sessionRef.current.isCurrent(generation)) return undefined;
          return client.createSession({
            outletRef,
            advisedTokens: journey.advisedTokens === undefined ? [] : journey.advisedTokens,
          });
        })
        .then(response => {
          if (!validReference(response?.sessionRef)) throw new Error('Session reference is unavailable');
          return response.sessionRef;
        })
        .catch(error => {
          journey.creation = undefined;
          throw error;
        });
    }
    const revision = journey.listRevision;
    const load = async () => {
      try {
        const reference = await journey.creation;
        if (!isCurrent()) return;
        setTokenizationSessionRef(reference);
        const response = await client.getSession({ outletRef, sessionRef: reference, skipConsent });
        if (!isCurrent() || journey.listRevision !== revision) return;
        if (!Array.isArray(response?.tokens)) throw new Error('Session token list is unavailable');
        setTnc({ loaded: true, url: response.tncUrl });
        setSavedTokens({ loading: false, tokens: response.tokens, page: response.page, failed: false });
        setSelectedTokenRef(current => revision === 0
          ? defaultSelectedTokenRef(response.tokens, current)
          : savedPaymentMethodSelection(response.tokens, current) ? current : null);
      } catch {
        if (!isCurrent() || journey.listRevision !== revision) return;
        setTnc({ loaded: true, url: undefined });
        setSavedTokens({ loading: false, tokens: [], failed: true });
        setSelectedTokenRef(null);
      }
    };
    load();
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

  const applyAddOutcome = useCallback(
    ({ state, result, updatedTokenList }, previousTokens = []) => {
      const journey = backendSessionRef.current;
      if (state === VERIFICATION_STATES.SUCCESS && updatedTokenList && journey) {
        const { tokens, page, tncUrl } = updatedTokenList;
        journey.listRevision += 1;
        setTnc(current => ({ loaded: true, url: tncUrl ?? current.url }));
        setSavedTokens({ loading: false, tokens, page, failed: false });
        setSelectedTokenRef(current => savedPaymentMethodSelection(tokens, current) ? current : null);
        const previouslyVerified = new Set(previousTokens
          .filter(token => token.status === 'VERIFIED')
          .map(token => token.tokenRef));
        setTokenSaved(tokens.some(token =>
          token.status === 'VERIFIED' && !previouslyVerified.has(token.tokenRef),
        ));
      }
      if (state === VERIFICATION_STATES.READY || state === VERIFICATION_STATES.SUCCESS) {
        sessionRef.current.endNative();
        sessionRef.current.setAccepted(false);
        setConsentAccepted(false);
        setStatus(VERIFICATION_STATES.READY);
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
    [language],
  );

  const handleDismiss = useCallback(() => {
    if (selectionAttemptRef.current) return;
    if (sessionRef.current.emitCancel(onCancelRef.current)) {
      setSelectionClosed(true);
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

  const renderedGeneration = sessionRef.current.generation();
  const sessionClient = backendSessionRef.current?.client;
  const selectionUiRef = useRef(null);
  selectionUiRef.current = {
    savedTokens, selectedTokenRef, status, visible, selectionStatus,
    tokenizationSessionRef, outletRef, skipConsent, termsUrl: consent?.url,
    language, methods, getUsageType,
  };
  const onSelectMethod = useCallback(
    async method => {
      const current = selectionUiRef.current;
      if (
        !visible || !current.visible || current.savedTokens.loading || current.savedTokens.failed ||
        !tokenizationSessionRef || current.getUsageType !== getUsageType ||
        current.outletRef !== outletRef || current.tokenizationSessionRef !== tokenizationSessionRef ||
        current.skipConsent !== skipConsent || current.termsUrl !== consent?.url || current.language !== language ||
        !current.methods.includes(method) ||
        ![VERIFICATION_STATES.READY, VERIFICATION_STATES.FAILED].includes(current.status) ||
        !['idle', 'failed'].includes(current.selectionStatus) || selectionAttemptRef.current ||
        !sessionRef.current.isCurrent(renderedGeneration) || sessionRef.current.isInFlight() ||
        backendSessionRef.current?.client !== sessionClient
      ) return;
      const generation = renderedGeneration;
      const isCurrent = () => sessionRef.current.isCurrent(generation);
      const rejectAction = error => {
        if (!sessionRef.current.tryBeginNative()) return;
        applyAddOutcome({
          state: VERIFICATION_STATES.FAILED,
          result: apiErrorResult({ method, error }),
        });
      };
      let usageType;
      try {
        usageType = validateUsageType(getUsageType?.({ method }));
      } catch {
        rejectAction(invalidUsageType());
        return;
      }
      if (method !== 'CARD' && !isWalletTokenizationAvailable(sessionClient)) {
        rejectAction(walletBackendPendingError());
        return;
      }
      const activeOrder = sessionOrderRef.current || order;
      if (!activeOrder && method !== 'CARD') {
        rejectAction({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
        return;
      }
      // Clicking an actionable Add Card/Wallet control accepts the notice shown
      // for this attempt. Record it before acquiring the native gate, whose
      // in-flight state prevents later acceptance changes or duplicate clicks.
      if (!sessionRef.current.setAccepted(false, undefined, generation)) return;
      const accepted = skipConsent !== true;
      if (accepted && !sessionRef.current.setAccepted(true, () => new Date(), generation)) return;
      const acceptedAt = sessionRef.current.acceptanceTimestamp();
      if (!sessionRef.current.canProceed(skipConsent) || !sessionRef.current.tryBeginNative()) return;
      setConsentAccepted(accepted);
      const getConsentData = () =>
        buildConsentData({
          skipConsent,
          accepted,
          acceptedAt,
          tncUrl: consent?.url,
          language,
          platform: Platform.OS,
          osVersion: Platform.Version,
          screen: Dimensions.get('screen'),
        });
      setSelectionStatus('idle');
      setSelectionError(undefined);
      setStatus(VERIFICATION_STATES.SUBMITTING);
      setErrorMessage(undefined);
      if (method === 'CARD') {
        runAfterRnModalHidden(async () => {
          if (!isCurrent()) return;
          const attempt = startNativeCardTokenization({
            client: sessionClient,
            outletRef,
            sessionRef: tokenizationSessionRef,
            usageType,
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
                back: t(language, 'BACK'),
                processing: t(language, 'SAVING_PAYMENT_METHOD'),
                invalid: t(language, 'CARD_INPUT_INVALID'),
              },
            },
          });
          nativeCardCancelRef.current = attempt.cancel;
          const outcome = await attempt.promise;
          if (isCurrent()) {
            nativeCardCancelRef.current = null;
            restoreRnModal();
            applyAddOutcome(outcome, current.savedTokens.tokens);
          }
        });
        return;
      }
      if (method === 'APPLE_PAY') {
        runAfterRnModalHidden(async () => {
          const outcome = await runWalletTokenization({
            method: 'APPLE_PAY',
            client: sessionClient,
            outletRef,
            sessionRef: tokenizationSessionRef,
            usageType,
            order: walletTokenizationOrder(activeOrder),
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
            applyAddOutcome(outcome, current.savedTokens.tokens);
          }
        });
        return;
      }
      if (method === 'GOOGLE_PAY') {
        const outcome = await runGooglePayTokenization({
          client: sessionClient,
          outletRef,
          sessionRef: tokenizationSessionRef,
          usageType,
          order: walletTokenizationOrder(activeOrder),
          googlePayConfig,
          initiateGooglePay,
          getConsentData,
          isCurrent,
          onVerifying: () => {
            if (isCurrent()) setStatus(VERIFICATION_STATES.VERIFYING);
          },
        });
        if (isCurrent()) applyAddOutcome(outcome, current.savedTokens.tokens);
        return;
      }
    },
    [
      visible,
      skipConsent,
      language,
      consent?.url,
      theme,
      order,
      applePayConfig,
      googlePayConfig,
      sessionClient,
      outletRef,
      getUsageType,
      applyAddOutcome,
      restoreRnModal,
      runAfterRnModalHidden,
      renderedGeneration,
      tokenizationSessionRef,
    ],
  );

  const canSelect = current =>
    current.visible && !current.savedTokens.loading && !current.savedTokens.failed &&
    !sessionRef.current.isInFlight() && sessionRef.current.isCurrent(renderedGeneration) &&
    current.tokenizationSessionRef === tokenizationSessionRef && current.outletRef === outletRef &&
    ['idle', 'failed'].includes(current.selectionStatus) &&
    [VERIFICATION_STATES.READY, VERIFICATION_STATES.FAILED].includes(current.status);
  const onSelectToken = tokenRef => {
    const current = selectionUiRef.current;
    if (!canSelect(current) || !savedPaymentMethodSelection(current.savedTokens.tokens, tokenRef)) return;
    selectionUiRef.current = { ...current, selectedTokenRef: tokenRef, selectionStatus: 'idle' };
    setSelectedTokenRef(tokenRef);
    setSelectionStatus('idle');
    setSelectionError(undefined);
  };
  const confirmSavedToken = async tokenRef => {
    const current = selectionUiRef.current;
    if (
      !canSelect(current) || current.selectedTokenRef !== tokenRef ||
      !savedPaymentMethodSelection(current.savedTokens.tokens, tokenRef)
    ) return;
    const client = backendSessionRef.current?.client;
    if (!tokenizationSessionRef || typeof client?.selectToken !== 'function') {
      setSelectionStatus('failed');
      setSelectionError(resolvedModeConfig.labels.selectionError || t(language, 'SELECTION_UNAVAILABLE'));
      return;
    }
    if (!sessionRef.current.tryBeginNative()) return;
    const attempt = { id: ++selectionCounterRef.current, generation: renderedGeneration };
    selectionAttemptRef.current = attempt;
    selectionUiRef.current = { ...current, selectionStatus: 'submitting' };
    setSelectionStatus('submitting');
    setSelectionError(undefined);
    const isCurrent = () => {
      const latest = selectionUiRef.current;
      return selectionAttemptRef.current === attempt &&
        sessionRef.current.isCurrent(attempt.generation) && latest.visible &&
        latest.tokenizationSessionRef === tokenizationSessionRef && latest.outletRef === outletRef;
    };
    try {
      const response = await client.selectToken({ outletRef, sessionRef: tokenizationSessionRef, tokenRef });
      if (!isCurrent()) return;
      if (response?.status !== 'SELECTED') throw new Error('Selection was not confirmed');
      sessionRef.current.endNative();
      selectionUiRef.current = { ...selectionUiRef.current, selectionStatus: 'confirmed' };
      setSelectionStatus('confirmed');
      // Payment can use the session reference after the backend confirms selection.
      selectionTimerRef.current = setTimeout(() => {
        if (!isCurrent()) return;
        selectionAttemptRef.current = null;
        setSelectionClosed(true);
        sessionRef.current.close();
        onSelectionCompleteRef.current?.({ flow: 'TOKENIZATION', status: 'SELECTED', canClose: true, sessionRef: tokenizationSessionRef });
      }, 1100);
    } catch {
      if (!isCurrent()) return;
      selectionAttemptRef.current = null;
      sessionRef.current.endNative();
      selectionUiRef.current = { ...selectionUiRef.current, selectionStatus: 'failed' };
      setSelectionStatus('failed');
      setSelectionError(resolvedModeConfig.labels.selectionError || t(language, 'TRY_ANOTHER_PAYMENT_METHOD'));
    }
  };
  const retrySavedTokens = () => {
    const current = selectionUiRef.current;
    if (!canSelect({ ...current, savedTokens: { ...current.savedTokens, failed: false } })) return;
    const loading = { ...current.savedTokens, loading: true, failed: false };
    selectionUiRef.current = { ...current, savedTokens: loading };
    setSavedTokens(loading);
    setRefreshNonce(value => value + 1);
  };
  return (
    <Modal
      visible={Boolean(visible) && !hideForNative && !selectionClosed}
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
        orderSummary={presentationOrder}
        consent={consent}
        consentAccepted={consentAccepted}
        savedTokens={savedTokens}
        selectedTokenRef={selectedTokenRef}
        onSelectToken={onSelectToken}
        onConfirmSavedToken={confirmSavedToken}
        modeConfig={resolvedModeConfig}
        selectionStatus={selectionStatus}
        selectionError={selectionError}
        importStatus={savedTokens.loading ? 'loading' : savedTokens.failed ? 'error' : savedTokens.tokens.length ? 'success' : 'empty'}
        onRetrySavedTokens={retrySavedTokens}
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
