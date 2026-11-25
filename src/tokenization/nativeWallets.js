import { NativeModules, Platform } from 'react-native';
const { normalizeOrderMoney } = require('./orderDetails');

// Tokenization captures encrypted Google Pay data without initiating a payment.
// The legacy PAYMENT helper keeps its positive-amount validation unchanged.
export const captureGooglePayToken = (order, config) =>
  new Promise((resolve, reject) => {
    const capture = NativeModules.NiSdk?.initiateGooglePay;
    const money = normalizeOrderMoney({ currencyCode: order?.amount?.currencyCode, value: 0 });
    if (
      Platform.OS !== 'android' || typeof capture !== 'function' ||
      order?.amount?.value !== 0 || !money ||
      !['merchantName', 'gateway', 'gatewayMerchantId'].every(key =>
        typeof config?.[key] === 'string' && config[key].trim())
    ) {
      reject({ status: 'Failed', code: 'GOOGLE_PAY_CONFIGURATION_REQUIRED' });
      return;
    }
    try {
      capture(
        config,
        { amount: '0.00', currencyCode: money.currencyCode },
        (status, token) => {
          if (status === 'Success' && typeof token === 'string' && token.length > 0) resolve({ token });
          else reject({ status: status === 'Aborted' ? 'Aborted' : 'Failed' });
        },
      );
    } catch {
      reject({ status: 'Failed' });
    }
  });

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
