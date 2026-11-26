import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Platform, Dimensions } from 'react-native';
import TokenizationScreen from './ui/TokenizationScreen';
import TokenizationPresentation, { SHEET_HEIGHT_FRACTION, SHEET_MAX_WIDTH } from './ui/TokenizationPresentation';
import { captureApplePayToken, captureGooglePayToken, isApplePayTokenizationSupported } from './nativeWallets';
import { startNativeCardTokenization } from './nativeCards';
const { mapNativeCardColors } = require('./mapNativeCardColors');
import {
  isApplePaySupported,
  isGooglePaySupported,
} from '../nativePayments';

const { buildConsentData } = require('./consentData');
const { resolveTokenizationTheme } = require('./resolveTheme');
const { getTokenizationMethods } = require('./supportedMethods');
const { t } = require('./strings');
const { resolveConsentInformation } = require('./consentInformation');
const { createTokenizationSession, apiErrorResult } = require('./session');
const { validateUsageType } = require('./usageType');
const { validReference } = require('./api/endpoints');
const { isWalletTokenizationAvailable, walletBackendPendingError } = require('./api/addWallet');
const { VERIFICATION_STATES, isBusyState } = require('./verificationStates');
const { savedPaymentMethodSelection, defaultSelectedTokenRef } = require('./savedPaymentMethodSelection');
const { resolveModeConfig } = require('./modeConfig');
const {
  paymentFailure, paymentSuccess, paymentCancellation, newVerifiedTokenRef,
} = require('./paymentOutcome');
const { walletTokenizationOrder } = require('./walletTokenizationOrder');
const { normalizeOrderDetails } = require('./orderDetails');
const { acceptedCardSchemes } = require('./acceptedCardSchemes');
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
const LOADING_TOKENS = { loading: true, tokens: [], failed: false };

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
  onResult,
  sessionRef: tokenizationSessionRef,
  modeConfig,
  onSelectionComplete,
}) => {
  // Optional caller context is for language, consent and native capture.
  const suppliedOrder = orderDetails == null ? legacyOrder : orderDetails;
  const order = suppliedOrder && typeof suppliedOrder === 'object' && !Array.isArray(suppliedOrder)
    ? suppliedOrder : undefined;
  const language = [languageProp, orderDetails?.language, legacyOrder?.language]
    .map(value => typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : undefined)
    .find(value => ['en', 'fr', 'ar'].includes(value)) || 'en';
  const tokenizationClientRef = useRef(tokenizationClient);
  tokenizationClientRef.current = tokenizationClient;
  const [tnc, setTnc] = useState({ loaded: false, url: undefined });
  const [savedTokens, setSavedTokens] = useState(LOADING_TOKENS);
  const backendSessionRef = useRef(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedTokenRef, setSelectedTokenRef] = useState(null);
  const [selectionStatus, setSelectionStatus] = useState('idle');
  const [selectionError, setSelectionError] = useState(undefined);
  const [loadFailure, setLoadFailure] = useState(null);
  const [actionsDisabled, setActionsDisabled] = useState(false);
  const [selectionClosed, setSelectionClosed] = useState(false);
  const selectionAttemptRef = useRef(null);
  const terminalOutcomeRef = useRef(false);
  const onResultRef = useRef(onResult);
  const onSelectionCompleteRef = useRef(onSelectionComplete);
  onResultRef.current = onResult;
  onSelectionCompleteRef.current = onSelectionComplete;
  const resolvedModeConfig = useMemo(() => resolveModeConfig(modeConfig, language), [modeConfig, language]);
  const { addCardsBeforePay, tokenType, showSecurityNote } = resolvedModeConfig;
  const theme = useMemo(
    () => resolveTokenizationTheme(branding, { language }),
    [branding, language],
  );
  const [status, setStatus] = useState(VERIFICATION_STATES.READY);
  const [errorMessage, setErrorMessage] = useState(undefined);
  const [applePaySupported, setApplePaySupported] = useState(false);
  const [googlePaySupported, setGooglePaySupported] = useState(false);
  const [hideForNative, setHideForNative] = useState(false);
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const sheetHeight = useRef(undefined);
  const onSheetLayout = useCallback(event => {
    const height = event.nativeEvent.layout.height;
    if (height > 0) sheetHeight.current = height;
  }, []);
  const [modalShown, setModalShown] = useState(false);
  const modalVisible = Boolean(visible) && !hideForNative && !selectionClosed;
  useEffect(() => {
    if (!modalVisible) setModalShown(false);
  }, [modalVisible]);

  const sessionRef = useRef(null);
  if (sessionRef.current == null) {
    sessionRef.current = createTokenizationSession();
  }
  const wasVisibleRef = useRef(false);
  const sessionOrderRef = useRef(order);
  const consent = resolveConsentInformation({
    skipConsent,
    order: sessionOrderRef.current,
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
  const lifecycleRef = useRef(0);
  const previousSessionRef = useRef({ outletRef, sessionRef: tokenizationSessionRef });
  onErrorRef.current = onError;
  onCancelRef.current = onCancel;

  const reportResult = useCallback((result, terminal) => {
    if (terminalOutcomeRef.current) return false;
    if (terminal) terminalOutcomeRef.current = true;
    onResultRef.current?.(result);
    return true;
  }, []);

  const reportSelectionComplete = useCallback(reference => {
    if (reportResult(paymentSuccess(reference), true)) {
      onSelectionCompleteRef.current?.({
        flow: FLOW, status: 'SELECTED', canClose: true, sessionRef: reference,
      });
    }
  }, [reportResult]);

  const reportClosedJourney = useCallback((journey, confirmed) => {
    if (confirmed) reportSelectionComplete(confirmed);
    else reportResult(paymentCancellation(journey?.client ? journey.sessionRef : undefined, 'host'), true);
  }, [reportResult, reportSelectionComplete]);

  useEffect(() => {
    if (!visible) {
      if (wasVisibleRef.current) {
        reportClosedJourney(backendSessionRef.current, selectionAttemptRef.current?.confirmed);
      }
      setSelectedTokenRef(null);
      selectionAttemptRef.current = null;
      setSelectionStatus('idle');
      setSelectionError(undefined);
      setLoadFailure(null);
      setSavedTokens(LOADING_TOKENS);
      setActionsDisabled(false);
      setSelectionClosed(false);
      nativeCardCancelRef.current?.();
      nativeCardCancelRef.current = null;
      sessionRef.current.close();
      backendSessionRef.current = null;
      wasVisibleRef.current = false;
      setStatus(VERIFICATION_STATES.READY);
      setErrorMessage(undefined);
      setHideForNative(false);
      setCardFormOpen(false);
      nativeGateRef.current = null;
      return;
    }
    if (!wasVisibleRef.current) {
      terminalOutcomeRef.current = false;
      setSelectedTokenRef(null);
      selectionAttemptRef.current = null;
      setSelectionStatus('idle');
      setSelectionError(undefined);
      setLoadFailure(null);
      setActionsDisabled(false);
      setSelectionClosed(false);
      sessionRef.current.start();
      sessionOrderRef.current = order;
      setStatus(VERIFICATION_STATES.READY);
      setErrorMessage(undefined);
      setHideForNative(false);
      setCardFormOpen(false);
      setSessionNonce(n => n + 1);
    } else if (!sessionOrderRef.current && order) {
      sessionOrderRef.current = order;
      setSessionNonce(n => n + 1);
    }
    wasVisibleRef.current = true;
  }, [visible, order, reportClosedJourney]);

  useEffect(() => {
    const lifecycle = ++lifecycleRef.current;
    return () => {
      const wasVisible = wasVisibleRef.current;
      const journey = backendSessionRef.current;
      const confirmed = selectionAttemptRef.current?.confirmed;
      nativeCardCancelRef.current?.();
      selectionAttemptRef.current = null;
      nativeCardCancelRef.current = null;
      sessionRef.current.close();
      wasVisibleRef.current = false;
      nativeGateRef.current = null;
      // React may run effect cleanup and mount again without actually unmounting.
      if (wasVisible) Promise.resolve().then(() => {
        if (lifecycleRef.current === lifecycle) reportClosedJourney(journey, confirmed);
      });
    };
  }, [reportClosedJourney]);

  useEffect(() => {
    const previous = previousSessionRef.current;
    if (previous.outletRef === outletRef && previous.sessionRef === tokenizationSessionRef) return;
    previousSessionRef.current = { outletRef, sessionRef: tokenizationSessionRef };
    terminalOutcomeRef.current = false;
    backendSessionRef.current = null;
    selectionAttemptRef.current = null;
    nativeCardCancelRef.current?.();
    nativeCardCancelRef.current = null;
    nativeGateRef.current = null;
    sessionRef.current.close();
    if (visible) sessionRef.current.start();
    sessionOrderRef.current = order;
    setSessionNonce(n => n + 1);
    setHideForNative(false);
    setCardFormOpen(false);
    setStatus(VERIFICATION_STATES.READY);
    setErrorMessage(undefined);
    setLoadFailure(null);
    setActionsDisabled(false);
    setSelectionClosed(false);
    setSelectedTokenRef(null);
    setSelectionStatus('idle');
    setSelectionError(undefined);
  }, [outletRef, tokenizationSessionRef, visible, order]);

  // Get the merchant-provided session, including on retry or consent-mode changes.
  useEffect(() => {
    if (!visible) {
      setTnc({ loaded: false, url: undefined });
      return undefined;
    }
    const generation = sessionRef.current.generation();
    let cancelled = false;
    const isCurrent = () => !cancelled && sessionRef.current.isCurrent(generation);
    let journey = backendSessionRef.current;
    if (journey?.generation !== generation || journey.outletRef !== outletRef || journey.sessionRef !== tokenizationSessionRef) {
      setTnc({ loaded: false, url: undefined });
      journey = { outletRef, sessionRef: tokenizationSessionRef, generation, listRevision: 0 };
      backendSessionRef.current = journey;
    }
    const client = journey.client || tokenizationClientRef.current;
    const revision = journey.listRevision;
    const fail = error => {
      if (!isCurrent() || journey.listRevision !== revision) return;
      const initializing = !journey.client;
      const failure = paymentFailure({
        stage: initializing ? 'initialize' : 'refresh', error, sessionID: journey.sessionRef,
      });
      if (initializing) {
        sessionRef.current.close();
        setSelectionClosed(true);
        reportResult(failure.result, true);
        return;
      }
      setTnc({ loaded: false, url: undefined });
      setSavedTokens({ loading: false, tokens: [], failed: true });
      setSelectedTokenRef(null);
      setLoadFailure(failure);
      setActionsDisabled(!failure.retryable);
      reportResult(failure.result, !failure.retryable);
    };
    if (terminalOutcomeRef.current) return undefined;
    if (typeof client?.getSession !== 'function' || !outletRef || !validReference(tokenizationSessionRef)) {
      fail({ status: 400 });
      return undefined;
    }
    setLoadFailure(null);
    setSavedTokens(LOADING_TOKENS);
    const load = async () => {
      try {
        const response = await client.getSession({ outletRef, sessionRef: tokenizationSessionRef, skipConsent });
        if (!isCurrent() || journey.listRevision !== revision) return;
        if (!Array.isArray(response?.tokens)) throw new Error('Session token list is unavailable');
        const { tokens, page, tncUrl, amount, orderSummary, paymentMethods: sessionPaymentMethods, maskPaymentInfo } = response;
        const acceptedSchemes = acceptedCardSchemes(sessionPaymentMethods?.card);
        journey.client = client;
        setTnc({ loaded: true, url: tncUrl });
        setSavedTokens({
          loading: false, tokens, page, failed: false, amount, orderSummary,
          paymentMethods: sessionPaymentMethods, acceptedSchemes, maskPaymentInfo,
        });
        setSelectedTokenRef(current => revision === 0 && !addCardsBeforePay
          ? defaultSelectedTokenRef(tokens, current)
          : savedPaymentMethodSelection(tokens, current) ? current : null);
      } catch (error) {
        fail(error);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [visible, outletRef, tokenizationSessionRef, skipConsent, refreshNonce, reportResult, addCardsBeforePay]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;
    const loadWalletSupport = async () => {
      if (Platform.OS === 'ios') {
        try {
          const supported = applePayConfig?.supportedNetworks !== undefined
            ? await isApplePayTokenizationSupported(applePayConfig)
            : await isApplePaySupported();
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
  }, [visible, applePayConfig, googlePayConfig]);

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

  const handleDismiss = useCallback((reason = 'cancel') => {
    if (selectionAttemptRef.current) return;
    if (sessionRef.current.emitCancel()) {
      const journey = backendSessionRef.current;
      setSelectionClosed(true);
      setTnc({ loaded: false, url: undefined });
      reportResult(paymentCancellation(journey?.client ? journey.sessionRef : undefined, reason), true);
      onCancelRef.current?.();
    }
  }, [reportResult]);

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
  const isSameSession = previousSessionRef.current.outletRef === outletRef &&
    previousSessionRef.current.sessionRef === tokenizationSessionRef;
  const visibleTokens = isSameSession ? savedTokens : LOADING_TOKENS;
  const { loading, failed, amount, orderSummary } = visibleTokens;
  const presentationOrder = useMemo(() => loading || failed
    ? null
    : normalizeOrderDetails({ orderDetails: { amount, orderSummary }, language }),
  [loading, failed, amount, orderSummary, language]);
  const methods = loading || failed ? [] : getTokenizationMethods(visibleTokens.paymentMethods, {
    paymentMethods,
    platform: Platform.OS,
    applePaySupported,
    googlePaySupported,
    walletTokenizationAvailable: isWalletTokenizationAvailable(sessionClient),
  });
  const selectionUiRef = useRef(null);
  selectionUiRef.current = {
    savedTokens: visibleTokens, selectedTokenRef, status, visible, selectionStatus,
    tokenizationSessionRef, outletRef, skipConsent, termsUrl: consent?.url,
    language, methods, tokenType, addCardsBeforePay, actionsDisabled,
  };
  const isCurrentJourney = useCallback(() => {
    const latest = selectionUiRef.current;
    const journey = backendSessionRef.current;
    return Boolean(tokenizationSessionRef) && latest.visible &&
      latest.outletRef === outletRef && latest.tokenizationSessionRef === tokenizationSessionRef &&
      journey?.outletRef === outletRef && journey?.sessionRef === tokenizationSessionRef &&
      journey?.generation === renderedGeneration &&
      sessionRef.current.isCurrent(renderedGeneration);
  }, [outletRef, renderedGeneration, tokenizationSessionRef]);

  const handleActionFailure = useCallback(({ stage, error, legacyResult, method }) => {
    const failure = paymentFailure({ stage, error, sessionID: tokenizationSessionRef });
    const message = t(language, failure.messageKey);
    selectionAttemptRef.current = null;
    sessionRef.current.endNative();
    setActionsDisabled(!failure.retryable);
    setStatus(stage === 'add' ? VERIFICATION_STATES.FAILED : VERIFICATION_STATES.READY);
    setSelectionStatus(stage === 'select' ? 'failed' : 'idle');
    setErrorMessage(stage === 'add' ? message : undefined);
    setSelectionError(stage === 'select' ? message : undefined);
    restoreRnModal();
    reportResult(failure.result, !failure.retryable);
    if (stage === 'add') {
      const code = legacyResult?.code;
      const safeError = { code, message: code === 'ORDER_NOT_FOUND' ? 'Order not found' : failure.result.message };
      const payload = apiErrorResult({ method, error: safeError });
      if (legacyResult?.status === 'AWAIT_3DS') payload.status = 'AWAIT_3DS';
      sessionRef.current.emitError(onErrorRef.current, payload);
    }
  }, [language, reportResult, restoreRnModal, tokenizationSessionRef]);

  const persistSelection = useCallback(async tokenRef => {
    if (!isCurrentJourney() || selectionAttemptRef.current) return;
    const client = backendSessionRef.current?.client;
    const attempt = {};
    selectionAttemptRef.current = attempt;
    selectionUiRef.current = { ...selectionUiRef.current, selectionStatus: 'submitting' };
    setSelectionStatus('submitting');
    setSelectionError(undefined);
    const isCurrent = () => selectionAttemptRef.current === attempt && isCurrentJourney();
    try {
      if (typeof client?.selectToken !== 'function') throw new Error('Selection is unavailable');
      const response = await client.selectToken({ outletRef, sessionRef: tokenizationSessionRef, tokenRef });
      if (response?.status !== 'SELECTED') throw new Error('Selection was not confirmed');
    } catch (error) {
      if (isCurrent()) handleActionFailure({ stage: 'select', error });
      return;
    }
    if (!isCurrent()) return;
    sessionRef.current.endNative();
    attempt.confirmed = tokenizationSessionRef;
    selectionAttemptRef.current = null;
    setSelectionClosed(true);
    sessionRef.current.close();
    reportSelectionComplete(tokenizationSessionRef);
  }, [handleActionFailure, isCurrentJourney, outletRef, reportSelectionComplete, tokenizationSessionRef]);

  const applyAddOutcome = useCallback(({ state, result, updatedTokenList, error }, previous, method) => {
    const journey = backendSessionRef.current;
    if (state === VERIFICATION_STATES.READY) {
      sessionRef.current.endNative();
      setStatus(VERIFICATION_STATES.READY);
      restoreRnModal();
      return;
    }
    if (state === VERIFICATION_STATES.SUCCESS && Array.isArray(updatedTokenList?.tokens) && journey) {
      const { tokens, page, tncUrl } = updatedTokenList;
      journey.listRevision += 1;
      setTnc(current => ({ loaded: true, url: tncUrl ?? current.url }));
      setSavedTokens(current => ({ ...current, loading: false, tokens, page, failed: false }));
      setSelectedTokenRef(current => savedPaymentMethodSelection(tokens, current) ? current : null);
      if (method === 'CARD' && addCardsBeforePay) {
        const previousRefs = new Set(previous.tokens.map(token => token?.tokenRef));
        const addedCard = tokens.some(token => token?.type === 'CARD' &&
          !previousRefs.has(token.tokenRef) && savedPaymentMethodSelection(tokens, token.tokenRef));
        if (addedCard) {
          sessionRef.current.endNative();
          setStatus(VERIFICATION_STATES.READY);
          restoreRnModal();
          return;
        }
        return handleActionFailure({ stage: 'add', error: error || result, legacyResult: result, method });
      }
      const tokenRef = newVerifiedTokenRef(previous.tokens, tokens, method, {
        previousPage: previous.page, updatedPage: page,
      });
      if (tokenRef) {
        // The native Pay action already chose this new method. Persist the choice
        // before returning control to the merchant, and never select a prior card.
        return persistSelection(tokenRef);
      }
    }
    handleActionFailure({ stage: 'add', error: error || result, legacyResult: result, method });
  }, [addCardsBeforePay, handleActionFailure, persistSelection, restoreRnModal]);

  const onSelectMethod = useCallback(
    async method => {
      const current = selectionUiRef.current;
      if (
        !isCurrentJourney() || terminalOutcomeRef.current || current.savedTokens.loading ||
        current.savedTokens.failed || current.actionsDisabled ||
        !Object.is(current.tokenType, tokenType) ||
        current.addCardsBeforePay !== addCardsBeforePay ||
        current.skipConsent !== skipConsent || current.termsUrl !== consent?.url || current.language !== language ||
        !current.methods.includes(method) ||
        ![VERIFICATION_STATES.READY, VERIFICATION_STATES.FAILED].includes(current.status) ||
        !['idle', 'failed'].includes(current.selectionStatus) || selectionAttemptRef.current ||
        sessionRef.current.isInFlight() || backendSessionRef.current?.client !== sessionClient
      ) return;
      const isCurrent = isCurrentJourney;
      const rejectAction = error => {
        if (!isCurrent() || !sessionRef.current.tryBeginNative()) return;
        handleActionFailure({ stage: 'add', error, legacyResult: error, method });
      };
      let usageType;
      try {
        usageType = validateUsageType(tokenType);
      } catch (error) {
        rejectAction(error);
        return;
      }
      if (!isCurrent()) return;
      if (method !== 'CARD' && !isWalletTokenizationAvailable(sessionClient)) {
        rejectAction(walletBackendPendingError());
        return;
      }
      let walletOrder;
      if (method !== 'CARD') {
        try {
          walletOrder = walletTokenizationOrder(sessionOrderRef.current, current.savedTokens.amount);
        } catch (error) {
          rejectAction(error);
          return;
        }
      }
      if (!sessionRef.current.tryBeginNative()) return;
      // Card consent is accepted on native submission after valid input.
      // Wallet terms sit below the wallet button and acceptance starts there.
      const accepted = skipConsent !== true;
      const walletAcceptedAt = method === 'CARD' ? undefined : new Date().toISOString();
      const getConsentData = () =>
        buildConsentData({
          skipConsent,
          accepted,
          acceptedAt: walletAcceptedAt ?? new Date().toISOString(),
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
      const finish = outcome => {
        if (isCurrent()) applyAddOutcome(outcome, current.savedTokens, method);
      };
      const fail = error => finish({ state: VERIFICATION_STATES.FAILED, error });
      const runCard = async () => {
        setCardFormOpen(true);
        try {
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
              mode: resolvedModeConfig.presentation,
              sheetHeight: sheetHeight.current,
              sheetHeightFraction: SHEET_HEIGHT_FRACTION,
              sheetMaxWidth: SHEET_MAX_WIDTH,
              colors: mapNativeCardColors(theme),
              rtl: language === 'ar',
              acceptedSchemes: current.savedTokens.acceptedSchemes,
              maskPaymentInfo: current.savedTokens.maskPaymentInfo === true,
              ...(showSecurityNote ? { securityNote: t(language, 'CARD_DETAILS_SECURE') } : {}),
              labels: {
                title: t(language, addCardsBeforePay ? 'ADD_NEW_CARD' : 'PAY_BY_CARD'),
                cardInformation: t(language, 'CARD_INFORMATION'),
                pan: t(language, 'CARD_NUMBER'),
                panPlaceholder: '•••• •••• •••• 1234',
                acceptedSchemes: t(language, 'ACCEPTED_CARD_SCHEMES'),
                expiry: t(language, 'CARD_EXPIRY'),
                expiryPlaceholder: t(language, 'CARD_EXPIRY_PLACEHOLDER'),
                cvv: t(language, 'CARD_CVV'),
                cvvPlaceholder: 'CVV',
                name: t(language, 'CARDHOLDER_NAME'),
                namePlaceholder: t(language, 'CARDHOLDER_PLACEHOLDER'),
                submit: t(language, addCardsBeforePay ? 'ADD_CARD' : 'PAY'),
                cancel: t(language, 'CANCEL'),
                back: t(language, 'BACK'),
                processing: t(language, 'VERIFYING_PAYMENT_METHOD'),
                invalid: t(language, 'CARD_INPUT_INVALID'),
              },
              ...(consent ? { consent: {
                text: `${t(language, 'CONTINUING_AGREEMENT')} ${t(language, 'PAYMENT_DISCLAIMER_2')}.`,
                linkLabel: t(language, 'PAYMENT_DISCLAIMER_2'),
                url: consent.url,
              } } : {}),
            },
          });
          nativeCardCancelRef.current = attempt.cancel;
          const outcome = await attempt.promise;
          if (isCurrent()) {
            nativeCardCancelRef.current = null;
            finish(outcome);
            setCardFormOpen(false);
          }
        } catch (error) {
          if (isCurrent()) {
            nativeCardCancelRef.current = null;
            fail(error);
            setCardFormOpen(false);
          }
        }
      };
      if (method === 'CARD') {
        runCard();
        return;
      }
      const runWallet = async () => {
        const common = {
          client: sessionClient,
          outletRef,
          sessionRef: tokenizationSessionRef,
          usageType,
          order: walletOrder,
          getConsentData,
          isCurrent,
          onVerifying: () => {
            if (isCurrent()) setStatus(VERIFICATION_STATES.VERIFYING);
          },
        };
        try {
          const outcome = method === 'APPLE_PAY'
            ? await runWalletTokenization({
              ...common, method, googlePayConfig: applePayConfig, captureWallet: captureApplePayToken,
            })
            : await runGooglePayTokenization({ ...common, googlePayConfig, initiateGooglePay: captureGooglePayToken });
          finish(outcome);
        } catch (error) {
          fail(error);
        }
      };
      if (method === 'APPLE_PAY') runAfterRnModalHidden(runWallet);
      else await runWallet();
    },
    [
      isCurrentJourney,
      skipConsent,
      language,
      consent?.url,
      theme,
      order,
      applePayConfig,
      googlePayConfig,
      sessionClient,
      outletRef,
      tokenType,
      addCardsBeforePay,
      resolvedModeConfig.presentation,
      showSecurityNote,
      applyAddOutcome,
      handleActionFailure,
      runAfterRnModalHidden,
      tokenizationSessionRef,
    ],
  );

  const canInteract = current =>
    current.visible && current.outletRef === outletRef &&
    current.tokenizationSessionRef === tokenizationSessionRef && !current.savedTokens.loading &&
    !current.actionsDisabled && !terminalOutcomeRef.current &&
    !sessionRef.current.isInFlight() && sessionRef.current.isCurrent(renderedGeneration) &&
    ['idle', 'failed'].includes(current.selectionStatus) &&
    [VERIFICATION_STATES.READY, VERIFICATION_STATES.FAILED].includes(current.status);
  const canSelect = current =>
    isCurrentJourney() && canInteract(current) && !current.savedTokens.failed;
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
    if (!sessionRef.current.tryBeginNative()) return;
    await persistSelection(tokenRef);
  };
  const retrySavedTokens = () => {
    const current = selectionUiRef.current;
    if (!isSameSession || !canInteract(current)) return;
    const loading = { ...current.savedTokens, loading: true, failed: false };
    selectionUiRef.current = { ...current, savedTokens: loading };
    setSavedTokens(loading);
    setRefreshNonce(value => value + 1);
  };
  const bottomSheet = resolvedModeConfig.presentation === 'bottomSheet';
  const dismissDisabled = Boolean(selectionAttemptRef.current) || isBusyState(status);
  const showContinueShopping = Array.isArray(paymentMethods) && paymentMethods.includes('CONTINUE_SHOPPING');
  const displayTokens = {
    ...visibleTokens,
    tokens: visibleTokens.tokens.filter(token => token?.status !== 'FAILED'),
  };
  return (
    <Modal
      visible={modalVisible}
      animationType={bottomSheet ? 'none' : 'slide'}
      presentationStyle={bottomSheet ? 'overFullScreen' : 'fullScreen'}
      transparent={bottomSheet}
      onShow={() => setModalShown(true)}
      onRequestClose={() => handleDismiss('back')}
      onDismiss={() => {
        if (nativeGateRef.current) {
          nativeGateRef.current.onDismiss();
        }
      }}>
      <TokenizationPresentation
        theme={theme}
        language={language}
        modeConfig={resolvedModeConfig}
        shown={modalVisible && modalShown}
        covered={cardFormOpen}
        onSheetLayout={onSheetLayout}
        dismissDisabled={dismissDisabled}
        onCancel={handleDismiss}
      >
        <TokenizationScreen
          theme={theme}
          language={language}
          orderSummary={presentationOrder}
          consent={consent}
          savedTokens={displayTokens}
          selectedTokenRef={selectedTokenRef}
          onSelectToken={onSelectToken}
          onConfirmSavedToken={confirmSavedToken}
          modeConfig={resolvedModeConfig}
          selectionStatus={selectionStatus}
          selectionError={selectionError}
          loadError={loadFailure ? t(language, loadFailure.messageKey) : undefined}
          canRetryLoad={loadFailure?.retryable === true}
          onRetrySavedTokens={retrySavedTokens}
          methods={methods}
          status={cardFormOpen ? VERIFICATION_STATES.READY : status}
          errorMessage={errorMessage}
          actionsDisabled={actionsDisabled || cardFormOpen}
          dismissDisabled={dismissDisabled}
          showContinueShopping={showContinueShopping}
          accessibilityHidden={cardFormOpen}
          onSelectMethod={onSelectMethod}
          onCancel={handleDismiss}
        />
      </TokenizationPresentation>
    </Modal>
  );
};

export default NgeniusTokenization;
export { FLOW };
