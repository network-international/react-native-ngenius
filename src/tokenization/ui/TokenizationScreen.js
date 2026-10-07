import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Platform, StatusBar, ScrollView } from 'react-native';
import BrandingHeader from './BrandingHeader';
import MethodList from './MethodList';
import StatusView from './StatusView';

const { createTokenizationStyles } = require('../createStyles');
const { t } = require('../strings');

const TokenizationScreen = ({
  theme,
  language,
  order,
  consent,
  methods,
  status,
  errorMessage,
  onSelectMethod,
  onCancel,
}) => {
  const isRtl = String(language || 'en').toLowerCase().startsWith('ar');
  const styles = useMemo(
    () => createTokenizationStyles({ ...theme, isRtl }),
    [theme, isRtl]
  );
  const isBusy = status === 'loading';
  const methodLabels = {
    CARD: t(language, 'ADD_CARD'),
    APPLE_PAY: Platform.OS === 'ios' ? `\uF8FFPay` : t(language, 'APPLE_PAY'),
    GOOGLE_PAY: 'GPay',
  };
  const showMethods = status === 'idle' || status === 'error';
  const closeLabel = status === 'success' ? t(language, 'CLOSE') : t(language, 'CONTINUE_SHOPPING');

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
            {status === 'error' ? (
              <View style={styles.errorBox} testID="tokenization-inline-error">
                <Text style={styles.errorText}>
                  {errorMessage || t(language, 'VERIFICATION_FAILED')}
                </Text>
              </View>
            ) : null}
            <MethodList
              methods={methods}
              styles={styles}
              labels={methodLabels}
              payWithLabel={t(language, 'PAY_WITH')}
              dividerLabel={t(language, 'PAYMENT_OPTIONS_DIVIDER')}
              cardSectionLabel={t(language, 'USE_CREDIT_DEBIT_CARD')}
              disabled={isBusy}
              onSelect={onSelectMethod}
              order={order}
              consent={consent}
              language={language}
            />
          </>
        ) : (
          <StatusView
            status={status}
            styles={styles}
            title={t(language, 'VERIFICATION_TITLE')}
            message={
              status === 'success'
                ? t(language, 'VERIFICATION_SUCCESS')
                : errorMessage || t(language, 'VERIFICATION_FAILED')
            }
            loadingLabel={t(language, 'CUSTOM_PENDING_PAYMENT_MESSAGE')}
            cancelLabel={closeLabel}
            onCancel={onCancel}
          />
        )}
        <View style={styles.flexSpacer} />
        {status === 'loading' ? null : showMethods ? (
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
