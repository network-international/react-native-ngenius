import { NativeModules, Platform } from 'react-native';
const { normalizeOrderMoney } = require('./orderDetails');

// Internal readiness for explicitly configured tokenization networks. An older
// native binary cannot establish this capability; do not widen to generic readiness.
export const isApplePayTokenizationSupported = config =>
  new Promise(resolve => {
    const check = NativeModules.NiSdk?.isApplePayTokenizationSupported;
    if (Platform.OS !== 'ios' || typeof check !== 'function') {
      resolve(false);
      return;
    }
    try {
      check(config, supported => resolve(supported === true));
    } catch {
      resolve(false);
    }
  });

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
    const money = normalizeOrderMoney({ currencyCode: order?.amount?.currencyCode, value: 0 });
    if (
      Platform.OS !== 'ios' ||
      typeof capture !== 'function' ||
      !config ||
      typeof config.merchantIdentifier !== 'string' || !config.merchantIdentifier.trim() ||
      typeof config.countryCode !== 'string' || !/^[A-Z]{2}$/.test(config.countryCode) ||
      order?.amount?.value !== 0 || !money
    ) {
      reject({ status: 'Failed', code: 'APPLE_PAY_CONFIGURATION_REQUIRED' });
      return;
    }
    try {
      capture(
        { ...config, amount: '0.00', currencyCode: money.currencyCode },
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
    } catch {
      reject({ status: 'Failed' });
    }
  });
