import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Platform, StatusBar, ScrollView } from 'react-native';
import BrandingHeader from './BrandingHeader';
import MethodList from './MethodList';
import ConsentCheckbox from './ConsentCheckbox';
import StatusView from './StatusView';

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
  onSelectMethod,
  onCancel,
}) => {
  const isRtl = String(language || 'en').toLowerCase().startsWith('ar');
  const styles = useMemo(
    () => createTokenizationStyles({ ...theme, isRtl }),
    [theme, isRtl]
  );
  const isBusy = isBusyState(status);
  const methodLabels = {
    CARD: t(language, 'ADD_CARD'),
    APPLE_PAY: Platform.OS === 'ios' ? `\uF8FFPay` : t(language, 'APPLE_PAY'),
    GOOGLE_PAY: 'GPay',
  };
  const showMethods =
    status === VERIFICATION_STATES.READY || status === VERIFICATION_STATES.FAILED;
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
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="tokenization-scroll"
      >
        <BrandingHeader theme={theme} styles={styles} testID="tokenization-branding-header" />
        {showMethods ? (
          <>
            {status === VERIFICATION_STATES.FAILED ? (
              <View style={styles.errorBox} testID="tokenization-inline-error">
                <Text style={styles.errorText}>
                  {errorMessage || t(language, 'VERIFICATION_FAILED')}
                </Text>
              </View>
            ) : null}
            {methods.length > 0 ? <ConsentCheckbox information={consent} language={language}
              styles={styles} checked={consentAccepted} onChange={onConsentChange} /> : null}
            <MethodList
              methods={methods}
              styles={styles}
              labels={methodLabels}
              payWithLabel={t(language, 'PAY_WITH')}
              dividerLabel={t(language, 'PAYMENT_OPTIONS_DIVIDER')}
              cardSectionLabel={t(language, 'USE_CREDIT_DEBIT_CARD')}
              disabled={isBusy || Boolean(consent && !consentAccepted)}
              onSelect={onSelectMethod}
            />
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
          />
        )}
        <View style={styles.flexSpacer} />
        {isBusy ? null : showMethods ? (
          <TouchableOpacity
            testID="tokenization-cancel"
            accessibilityRole="button"
            accessibilityLabel={t(language, 'CONTINUE_SHOPPING')}
            style={styles.cancelButton}
            onPress={onCancel}
          >
            <Text style={styles.cancelLabel}>{t(language, 'CONTINUE_SHOPPING')}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

export default TokenizationScreen;
