import React, { useMemo } from 'react';
import { View, Text, SafeAreaView, Platform, StatusBar, ScrollView, Pressable } from 'react-native';
import BrandingHeader from './BrandingHeader';
import MethodList from './MethodList';
import ConsentNotice from './ConsentNotice';
import StatusView from './StatusView';
import SavedTokens from './SavedTokens';
import SavedTokensSkeleton from './SavedTokensSkeleton';
import SelectionStatusView from './SelectionStatusView';
import OrderSummary from './OrderSummary';
import SecurityIcon from './SecurityIcon';

const { createTokenizationStyles } = require('../createStyles');
const { DEFAULT_SECTION_ORDER } = require('../modeConfig');
const { t } = require('../strings');
const { VERIFICATION_STATES, isBusyState } = require('../verificationStates');

const statusMessage = ({ language, status, errorMessage }) => {
  if (status === VERIFICATION_STATES.SUCCESS) {
    return t(language, 'VERIFICATION_SUCCESS');
  }
  if (status === VERIFICATION_STATES.AWAITING_3DS) {
    return t(language, 'VERIFICATION_PENDING');
  }
  return errorMessage || t(language, 'VERIFICATION_FAILED');
};

const ErrorBanner = ({ styles, testID, children }) => (
  <View style={styles.errorBox} testID={testID} accessibilityRole="alert" accessibilityLiveRegion="assertive">
    <Text style={styles.errorIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">!</Text>
    <Text style={styles.errorText}>{children}</Text>
  </View>
);

const TokenizationScreen = ({
  theme,
  language,
  consent,
  methods,
  status,
  errorMessage,
  savedTokens,
  onRetrySavedTokens,
  selectedTokenRef,
  onSelectToken,
  onConfirmSavedToken,
  onSelectMethod,
  onCancel,
  modeConfig = {},
  selectionStatus = 'idle',
  selectionError,
  importStatus,
  orderSummary,
  loadError,
  canRetryLoad = false,
  actionsDisabled = false,
  dismissDisabled = false,
  showContinueShopping = false,
  accessibilityHidden = false,
}) => {
  const isRtl = String(language || 'en').toLowerCase().startsWith('ar');
  const styles = useMemo(
    () => createTokenizationStyles({ ...theme, isRtl }),
    [theme, isRtl]
  );
  const selectionPending = selectionStatus === 'submitting';
  const isBusy = isBusyState(status) || selectionPending;
  const isFullscreen = modeConfig.presentation === 'fullscreen';
  const closeDisabled = isBusy || dismissDisabled;
  const payDisabled = isBusy || actionsDisabled;
  const loadingTokens = Boolean(savedTokens?.loading);
  const tokens = Array.isArray(savedTokens?.tokens) ? savedTokens.tokens.filter(token => token && token.status !== 'FAILED') : [];
  const hasSavedTokens = !loadingTokens && !savedTokens?.failed && tokens.length > 0;
  const selectedToken = tokens.find(token => token.tokenRef && token.tokenRef === selectedTokenRef && token.status === 'VERIFIED');
  const labels = modeConfig.labels || {};
  const returnLabel = modeConfig.returnButtonName || t(language, 'CONTINUE_SHOPPING');
  const returnStyle = modeConfig.returnButtonStyle || 'button';
  const addCardLabel = (hasSavedTokens ? labels.addAnotherCard : labels.addCard) ||
    t(language, 'ADD_NEW_CARD');
  const methodLabels = {
    CARD: modeConfig.addCardsBeforePay
      ? addCardLabel
      : labels.payByCard || (hasSavedTokens ? labels.addAnotherCard : labels.addCard) || t(language, 'PAY_BY_CARD'),
    APPLE_PAY: t(language, 'APPLE_PAY'),
    GOOGLE_PAY: 'Google Pay',
  };
  const orderLabels = {
    orderSummary: labels.orderSummary || t(language, 'ORDER_SUMMARY'),
    items: labels.orderItems || t(language, 'ORDER_ITEMS'),
    amount: labels.orderAmount || t(language, 'ORDER_AMOUNT'),
    shipping: labels.orderShipping || t(language, 'ORDER_SHIPPING'),
    tax: labels.orderTax || t(language, 'ORDER_TAX'),
    total: labels.orderTotal || t(language, 'ORDER_TOTAL'),
    show: t(language, 'SHOW_ORDER_SUMMARY'), hide: t(language, 'HIDE_ORDER_SUMMARY'),
  };
  const showMethods =
    !selectionPending && (status === VERIFICATION_STATES.READY || status === VERIFICATION_STATES.FAILED);
  const showLoadError = Boolean(loadError || savedTokens?.failed || importStatus === 'error');
  const showActionError = Boolean(errorMessage || selectionError ||
    status === VERIFICATION_STATES.FAILED || selectionStatus === 'failed');
  const closeLabel = showLoadError || status === VERIFICATION_STATES.SUCCESS ? t(language, 'CLOSE') : t(language, 'CANCEL');
  const showWallets = methods.some(method => method === 'APPLE_PAY' || method === 'GOOGLE_PAY');
  const visibleSections = (modeConfig.sectionOrder || DEFAULT_SECTION_ORDER).filter(section => {
    if (section === 'tokens') return hasSavedTokens;
    return section === 'wallets' ? showWallets : methods.includes('CARD');
  });
  const payLabel = labels.pay || labels.usePaymentMethod || t(language, 'PAY');
  const notice = <ConsentNotice information={consent} language={language}
    styles={styles} privacyPolicyUrl={modeConfig.privacyPolicyUrl} />;

  const sectionView = section => section === 'tokens' ? (
    <>
      <SavedTokens value={savedTokens} language={language} styles={styles}
        selectedTokenRef={selectedTokenRef} onSelectToken={onSelectToken} disabled={payDisabled}
        title={labels.savedMethodsTitle} hideTitle={!labels.savedMethodsTitle} />
      {hasSavedTokens && typeof onConfirmSavedToken === 'function' ? (
        <Pressable testID="tokenization-confirm-saved" accessibilityRole="button"
          accessibilityLabel={payLabel}
          accessibilityState={{ disabled: payDisabled || !selectedToken }} disabled={payDisabled || !selectedToken}
          onPress={() => { if (!payDisabled && selectedToken) onConfirmSavedToken(selectedToken.tokenRef); }}
          style={[styles.methodButton, styles.cardButton, (payDisabled || !selectedToken) && styles.methodDisabled]}>
          <Text style={styles.cardButtonLabel}>{payLabel}</Text>
        </Pressable>
      ) : null}
    </>
  ) : (
    <MethodList section={section} methods={methods} styles={styles} labels={methodLabels}
      payWithLabel={t(language, 'PAY_WITH')} walletNotice={section === 'wallets' && !actionsDisabled ? notice : null}
      securityLabel={modeConfig.showSecurityNote ? t(language, 'CARD_DETAILS_SECURE') : undefined}
      buttonIconColor={theme.branding.buttonText} disabled={payDisabled} onSelect={onSelectMethod} />
  );

  return (
    <SafeAreaView
      style={[
        styles.safe,
        isFullscreen ? null : styles.sheetSafe,
        isFullscreen && Platform.OS === 'android' ? { paddingTop: StatusBar.currentHeight || 24 } : null,
      ]}
      testID="tokenization-screen"
      accessibilityElementsHidden={accessibilityHidden}
      importantForAccessibility={accessibilityHidden ? 'no-hide-descendants' : 'auto'}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, !isFullscreen && styles.sheetContent]}
        keyboardShouldPersistTaps="handled"
        testID="tokenization-scroll"
      >
        <View style={[styles.paymentPanel, !isFullscreen && styles.sheetPaymentPanel]} testID="tokenization-payment-panel">
        <View style={styles.merchantHeader}>
          <View style={styles.merchantIdentity}>
            <BrandingHeader theme={theme} styles={styles} testID="tokenization-branding-header" />
          </View>
          <View testID="tokenization-security-shield" style={styles.securityShield} accessible
            accessibilityLabel={t(language, 'SECURE_CHECKOUT')}>
            <SecurityIcon color={theme.layout.colors.success} size={14} />
            <Text style={styles.securityLabel}>{t(language, 'SECURE_CHECKOUT')}</Text>
          </View>
        </View>
        <Text testID="tokenization-page-title" accessibilityRole="header" style={styles.pageTitle}>
          {showLoadError ? t(language, 'CHECKOUT_UNAVAILABLE') : labels.pageTitle || t(language, 'SELECT_PAYMENT_METHOD')}
        </Text>
        {!showLoadError && labels.pageSubtitle ? <Text testID="tokenization-page-subtitle" style={styles.pageSubtitle}>{labels.pageSubtitle}</Text> : null}
        {!loadingTokens && !showLoadError && !showActionError ? <OrderSummary value={orderSummary} styles={styles} labels={orderLabels}
          initialExpanded={modeConfig.orderSummaryInitiallyExpanded} /> : null}
        {selectionPending ? (
          <SelectionStatusView styles={styles} spinnerColor={theme.branding.focusColor}
            loadingLabel={labels.selectionPending || t(language, 'SELECTING_PAYMENT_METHOD')} />
        ) : loadingTokens ? (
          <SavedTokensSkeleton styles={styles} label={t(language, 'SAVED_TOKENS_LOADING')} />
        ) : showLoadError ? (
          <>
            <ErrorBanner styles={styles} testID="token-import-error">
              {loadError || t(language, 'PAYMENT_INITIALIZATION_FAILED')}
            </ErrorBanner>
            {canRetryLoad && !actionsDisabled && typeof onRetrySavedTokens === 'function' ? (
              <Pressable testID="saved-tokens-retry" accessibilityRole="button" onPress={onRetrySavedTokens} style={styles.retryButton}>
                <Text style={styles.retryLabel}>{t(language, 'RETRY')}</Text>
              </Pressable>
            ) : null}
          </>
        ) : showMethods ? (
          <>
            {showActionError ? (
              <ErrorBanner styles={styles} testID={selectionStatus === 'failed' ? 'selection-inline-error' : 'tokenization-inline-error'}>
                {errorMessage || selectionError || labels.selectionError || t(language,
                  selectionStatus === 'failed' ? 'PAYMENT_METHOD_SELECTION_FAILED' : 'PAYMENT_METHOD_ADD_FAILED')}
              </ErrorBanner>
            ) : null}
            <View testID="tokenization-method-list" style={styles.methods}>
              {visibleSections.map((section, index) => (
                <React.Fragment key={section}>
                  {index > 0 ? (
                    <View style={styles.dividerRow} testID="tokenization-methods-divider">
                      <View style={styles.dividerLine} /><Text style={styles.divider}>{t(language, 'METHOD_DIVIDER')}</Text><View style={styles.dividerLine} />
                    </View>
                  ) : null}
                  {sectionView(section)}
                </React.Fragment>
              ))}
            </View>
          </>
        ) : (
          <StatusView
            status={status}
            styles={styles}
            title={t(language, 'VERIFICATION_TITLE')}
            message={statusMessage({ language, status, errorMessage })}
            loadingLabel={t(
              language,
              status === VERIFICATION_STATES.VERIFYING
                ? 'VERIFYING_PAYMENT_METHOD'
                : 'CUSTOM_PENDING_PAYMENT_MESSAGE'
            )}
            cancelLabel={closeLabel}
            onCancel={onCancel}
            hideClose
          />
        )}
        <Text testID="tokenization-powered-by" style={styles.poweredBy}>
          {t(language, 'SECURE_PAYMENTS_BY')}{' '}<Text style={styles.poweredByBrand}>Network International</Text>
        </Text>
        </View>
      </ScrollView>
      {isFullscreen || (showContinueShopping && !showLoadError) ? <View style={[styles.returnFooter, !isFullscreen && styles.sheetReturnFooter]}>
        {showContinueShopping && !showLoadError ? (
          <Pressable testID="tokenization-continue-shopping" accessibilityRole={returnStyle === 'link' ? 'link' : 'button'}
            accessibilityLabel={returnLabel} accessibilityState={{ disabled: closeDisabled }} disabled={closeDisabled}
            onPress={() => { if (!closeDisabled) onCancel?.('continueShopping'); }}
            style={[returnStyle === 'button' ? styles.returnButton : styles.returnTextButton, closeDisabled && styles.methodDisabled]}>
            <Text style={[styles.returnLabel, returnStyle === 'link' && styles.returnLinkLabel]}>{returnLabel}</Text>
          </Pressable>
        ) : null}
        {isFullscreen ? (
          <Pressable testID="tokenization-cancel" accessibilityRole="button"
            accessibilityLabel={closeLabel} accessibilityState={{ disabled: closeDisabled }} disabled={closeDisabled}
            onPress={() => { if (!closeDisabled) onCancel?.('cancel'); }}
            style={[styles.returnTextButton, closeDisabled && styles.methodDisabled]}>
            <Text style={styles.returnLabel}>{closeLabel}</Text>
          </Pressable>
        ) : null}
      </View> : null}
    </SafeAreaView>
  );
};

export default TokenizationScreen;
