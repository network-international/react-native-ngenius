import React, { useMemo } from 'react';
import { View, Text, SafeAreaView, Platform, StatusBar, ScrollView, Pressable } from 'react-native';
import BrandingHeader from './BrandingHeader';
import MethodList from './MethodList';
import ConsentCheckbox from './ConsentCheckbox';
import StatusView from './StatusView';
import SavedTokens from './SavedTokens';
import SelectionStatusView from './SelectionStatusView';

const { createTokenizationStyles } = require('../createStyles');
const { t } = require('../strings');
const { VERIFICATION_STATES, isBusyState } = require('../verificationStates');

const statusMessage = ({ language, status, tokenSaved, errorMessage }) => {
  if (status === VERIFICATION_STATES.SUCCESS) {
    return t(language, tokenSaved ? 'TOKEN_SAVED_SUCCESS' : 'VERIFICATION_SUCCESS');
  }
  if (status === VERIFICATION_STATES.AWAITING_3DS) {
    return t(language, 'VERIFICATION_PENDING');
  }
  return errorMessage || t(language, 'VERIFICATION_FAILED');
};

const TokenizationScreen = ({
  theme,
  language,
  consent,
  consentAccepted = false,
  onConsentChange,
  methods,
  status,
  tokenSaved = false,
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
}) => {
  const isRtl = String(language || 'en').toLowerCase().startsWith('ar');
  const styles = useMemo(
    () => createTokenizationStyles({ ...theme, isRtl }),
    [theme, isRtl]
  );
  const selectionPending = selectionStatus === 'submitting';
  const selectionConfirmed = selectionStatus === 'confirmed';
  const isBusy = isBusyState(status) || selectionPending;
  const loadingTokens = Boolean(savedTokens?.loading);
  const tokens = Array.isArray(savedTokens?.tokens) ? savedTokens.tokens : [];
  const hasSavedTokens = !loadingTokens && !savedTokens?.failed && tokens.length > 0;
  const selectedToken = tokens.find(token => token.tokenRef && token.tokenRef === selectedTokenRef && token.status === 'VERIFIED');
  const labels = modeConfig.labels || {};
  const returnLabel = modeConfig.returnButtonName || t(language, 'CONTINUE_SHOPPING');
  const returnStyle = modeConfig.returnButtonStyle || 'button';
  const methodLabels = {
    CARD: (hasSavedTokens ? labels.addAnotherCard : labels.addCard) || t(language, hasSavedTokens ? 'ADD_ANOTHER_CARD' : 'ADD_CARD'),
    APPLE_PAY: t(language, 'APPLE_PAY'),
    GOOGLE_PAY: 'Google Pay',
  };
  const showMethods =
    !selectionPending && !selectionConfirmed && (status === VERIFICATION_STATES.READY || status === VERIFICATION_STATES.FAILED);
  const closeLabel =
    status === VERIFICATION_STATES.SUCCESS ? t(language, 'CLOSE') : t(language, 'CONTINUE_SHOPPING');

  return (
    <SafeAreaView
      style={[
        styles.safe,
        Platform.OS === 'android' ? { paddingTop: StatusBar.currentHeight || 24 } : null,
      ]}
      testID="tokenization-screen"
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="tokenization-scroll"
      >
        <BrandingHeader theme={theme} styles={styles} testID="tokenization-branding-header" />
        <Text testID="tokenization-page-title" accessibilityRole="header" style={styles.pageTitle}>
          {labels.pageTitle || t(language, hasSavedTokens || loadingTokens ? 'PAYMENT_METHODS' : 'ADD_PAYMENT_METHOD')}
        </Text>
        {selectionPending || selectionConfirmed ? (
          <SelectionStatusView status={selectionStatus} styles={styles}
            spinnerColor={theme.layout.colors.focus}
            loadingLabel={labels.selectionPending || t(language, 'SELECTING_PAYMENT_METHOD')}
            confirmedLabel={labels.selectionSuccessTitle || t(language, 'PAYMENT_METHOD_SELECTED')}
            confirmedMessage={labels.selectionSuccessMessage} />
        ) : showMethods ? (
          <>
            {tokenSaved && status === VERIFICATION_STATES.READY ? (
              <Text testID="tokenization-method-added" style={styles.methodAddedFeedback} accessibilityLiveRegion="polite">
                {t(language, 'TOKEN_SAVED_SUCCESS')}
              </Text>
            ) : null}
            {importStatus === 'success' || importStatus === 'empty' || (importStatus === 'error' && !savedTokens?.failed) ? (
              <Text testID={`token-import-${importStatus}`} style={styles.importFeedback} accessibilityLiveRegion="polite">
                {t(language, importStatus === 'success' ? 'IMPORTED_METHODS_READY' : importStatus === 'empty' ? 'IMPORTED_METHODS_EMPTY' : 'IMPORTED_METHODS_ERROR')}
              </Text>
            ) : null}
            <SavedTokens value={savedTokens} language={language} styles={styles} onRetry={onRetrySavedTokens}
              selectedTokenRef={selectedTokenRef} onSelectToken={onSelectToken} disabled={isBusy} title={labels.savedMethodsTitle} />
            {selectionStatus === 'failed' ? (
              <View style={styles.errorBox} testID="selection-inline-error" accessibilityLiveRegion="polite">
                <Text style={styles.errorText}>{selectionError || labels.selectionError || t(language, 'TRY_ANOTHER_PAYMENT_METHOD')}</Text>
              </View>
            ) : null}
            {status === VERIFICATION_STATES.FAILED ? (
              <View style={styles.errorBox} testID="tokenization-inline-error">
                <Text style={styles.errorText}>
                  {errorMessage || t(language, 'VERIFICATION_FAILED')}
                </Text>
              </View>
            ) : null}
            {!loadingTokens ? <>
              {hasSavedTokens && typeof onConfirmSavedToken === 'function' ? (
                <Pressable testID="tokenization-confirm-saved" accessibilityRole="button"
                  accessibilityLabel={labels.usePaymentMethod || t(language, 'USE_PAYMENT_METHOD')}
                  accessibilityState={{ disabled: !selectedToken }} disabled={!selectedToken}
                  onPress={() => { if (selectedToken) onConfirmSavedToken(selectedToken.tokenRef); }}
                  style={[styles.methodButton, styles.cardButton, !selectedToken && styles.methodDisabled]}>
                  <Text style={styles.cardButtonLabel}>{labels.usePaymentMethod || t(language, 'USE_PAYMENT_METHOD')}</Text>
                </Pressable>
              ) : null}
              {hasSavedTokens && methods.length > 0 ? <Text style={styles.sectionTitle}>{labels.addMethodTitle || t(language, 'ADD_PAYMENT_METHOD')}</Text> : null}
              {methods.length > 0 ? <ConsentCheckbox information={consent} language={language}
                styles={styles} checked={consentAccepted} onChange={onConsentChange} /> : null}
              <MethodList methods={methods} styles={styles} labels={methodLabels}
                payWithLabel={t(language, 'PAY_WITH')}
                dividerLabel={t(language, 'METHOD_DIVIDER')}
                cardSectionLabel={null}
                disabled={isBusy || Boolean(consent && !consentAccepted)} onSelect={onSelectMethod} />
            </> : null}
          </>
        ) : (
          <StatusView
            status={status}
            styles={styles}
            title={t(language, tokenSaved ? 'TOKEN_SAVED_TITLE' : 'VERIFICATION_TITLE')}
            message={statusMessage({ language, status, tokenSaved, errorMessage })}
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
        <View style={styles.flexSpacer} />
      </ScrollView>
      {!selectionConfirmed ? <View style={styles.returnFooter}>
        <Pressable testID="tokenization-cancel" accessibilityRole={returnStyle === 'link' ? 'link' : 'button'}
          accessibilityLabel={returnLabel} accessibilityState={{ disabled: isBusy }} disabled={isBusy}
          onPress={() => { if (!isBusy) onCancel?.(); }}
          style={[returnStyle === 'button' ? styles.returnButton : styles.returnTextButton, isBusy && styles.methodDisabled]}>
          <Text style={[styles.returnLabel, returnStyle === 'link' && styles.returnLinkLabel]}>{returnLabel}</Text>
        </Pressable>
      </View> : null}
    </SafeAreaView>
  );
};

export default TokenizationScreen;
