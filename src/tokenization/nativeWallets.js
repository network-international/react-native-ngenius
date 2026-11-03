import { NativeModules, Platform } from 'react-native';

// The payment API remains in nativePayments; this method captures encrypted data only.
export const captureApplePayToken = (order, config) =>
  new Promise((resolve, reject) => {
    const capture =
      NativeModules.NiSdk && NativeModules.NiSdk.captureApplePayToken;
    if (
      Platform.OS !== 'ios' ||
      typeof capture !== 'function' ||
      !config ||
      !config.merchantIdentifier ||
      !config.countryCode ||
      !order?.amount?.currencyCode ||
      !Number.isFinite(order.amount.value)
    ) {
      reject({ status: 'Failed', code: 'APPLE_PAY_CONFIGURATION_REQUIRED' });
      return;
    }
    const currency = order.amount.currencyCode;
    const digits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits;
    const amount =
      order.amount.formattedValue ||
      (order.amount.value / 10 ** digits).toFixed(digits);
    capture(
      { ...config, amount: String(amount), currencyCode: currency },
      (status, token) => {
        if (
          status === 'Success' &&
          typeof token === 'string' &&
          token.length > 0
        )
          resolve({ token });
        else reject({ status: status === 'Aborted' ? 'Aborted' : 'Failed' });
      },
    );
  });
