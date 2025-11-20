import { NativeModules, Platform } from 'react-native';
// import { SHIPPING_CONTACT_FIELDS, MERCHANT_CAPABILITIES, BILLING_CONTACT_FIELDS } from './apple-pay-constants';

const { NiSdk } = NativeModules;

export const SDK_VERSION = '3.0.0';

// Helper function to get device info for User-Agent
let deviceInfoCache = null;
export const getDeviceInfo = () => {
  return new Promise((resolve, reject) => {
    if (deviceInfoCache) {
      resolve(deviceInfoCache);
      return;
    }
    
    if (Platform.OS === 'android' && NiSdk && NiSdk.getDeviceInfo) {
      NiSdk.getDeviceInfo((info) => {
        if (info.error) {
          // Fallback if native method fails
          resolve({
            platform: 'android',
            manufacturer: 'unknown',
            model: 'unknown',
            osVersion: 0,
          });
        } else {
          deviceInfoCache = info;
          resolve(info);
        }
      });
    } else {
      // Fallback for iOS or if native module not available
      resolve({
        platform: Platform.OS,
        manufacturer: 'unknown',
        model: 'unknown',
        osVersion: 0,
      });
    }
  });
};

const initiateCardPayment = (order) => {
  return new Promise((resolve, reject) => {
    return NiSdk.initiateCardPaymentUI(order, (status) => {
      switch (status) {
        case "Success":
          resolve({ status });
          break;
        case "Failed":
        case "Aborted":
        default:
          reject({ status });
      }
    });
  });
}

const initiateSamsungPay = (order, merchantName, serviceId) => {
  return new Promise((resolve, reject) => {
    if (Platform.OS === 'android') {
      if (!merchantName) {
        reject({ status: 'Error', error: 'Merchant name is not found' });
        return;
      }
      if (!serviceId) {
        reject({ status: 'Error', error: 'ServiceId is not found' });
        return;
      }
      return NiSdk.initiateSamsungPay(
        order,
        merchantName,
        serviceId,
        (status, errorStr) => {
          switch (status) {
            case "Success":
              resolve({ status });
              break;
            case "Failed":
            default:
              reject({ status, error: errorStr });
          }
        },
      );
    } else {
      reject({ status: 'Failed', error: 'Unsupported platform' });
    }
  });
}

/**
 * @typedef {Object} applePayConfig
 * @property {string} merchantIdentifier
 * @property {string} countryCode
 * */

/**
 * Use this to initiate an Apple Pay transaction.
 * @param order - order info received from NGenius
 * @param {applePayConfig} applePayConfig  - config for Apple Pay
 * */

const initiateApplePay = (order, applePayConfig) => {
  return new Promise((resolve, reject) => {
    if (Platform.OS === 'ios') {
      const _applePayConfig = { ...applePayConfig };
      if (!order) {
        reject({ status: 'Error', error: 'Order not found' });
        return;
      }
      if (!order.amount || !order.amount.value || !order.amount.currencyCode) {
        reject({ status: 'Error', error: 'Order amount is missing' });
        return;
      }
      if (!applePayConfig.merchantIdentifier) {
        reject({ status: 'Error', error: 'Merchant identifier is not found' });
        return;
      }
      if (!applePayConfig.countryCode) {
        reject({ status: 'Error', error: 'Country code is not found' });
        return;
      }
      _applePayConfig.totalAmount = order.amount.value / 100;
      _applePayConfig.currencyCode = order.amount.currencyCode;
      if (!_applePayConfig.merchantName) {
        _applePayConfig.merchantName = 'Total';
      }
      return NiSdk.initiateApplePay(order, _applePayConfig, (status, errorStr) => {
        switch (status) {
          case "Success":
            resolve({ status });
            break;
          case "Failed":
          default:
            reject({ status, error: errorStr });
        }
      });
    } else {
      reject({ status: 'Not Supported', error: 'Apple pay is not supported in this platform' });
    }
  });
};

const isSamsungPaySupported = (serviceId) => {
  return new Promise((resolve, reject) => {
    if (Platform.OS === 'android') {
      // Native impl
      NiSdk.isSamsungPayEnabled(serviceId, (status) => {
        resolve(status);
      });
    } else {
      reject({ status: 'Not Supported', error: 'Samsung pay is not supported in this platform' });
    }
  });
};

const isApplePaySupported = () => {
  return new Promise((resolve, reject) => {
    if (Platform.OS === 'ios') {
      // Native impl
      NiSdk.isApplePaySupported((isSupported) => {
        resolve(isSupported);
      });
    } else {
      reject({ status: 'Not Supported', error: 'Apple pay is not supported in this platform' });
    }
  });
};

/**
 * @typedef {Object} googlePayConfig
 * @property {string} merchantName
 * @property {string} gateway
 * @property {string} gatewayMerchantId
 * @property {string} environment - 'TEST' or 'PRODUCTION'
 * @property {string} [merchantId] - Optional Google Pay merchant ID
 * @property {string} [merchantOrigin] - Optional merchant origin URL
 * */

/**
 * Use this to initiate a Google Pay transaction.
 * @param order - order info received from NGenius
 * @param {googlePayConfig} googlePayConfig - config for Google Pay
 * */

const initiateGooglePay = (order, googlePayConfig) => {
  return new Promise((resolve, reject) => {
    if (Platform.OS === 'android') {
      if (!NiSdk) {
        reject({ status: 'Error', error: 'Native module NiSdk is not available' });
        return;
      }
      if (!order) {
        reject({ status: 'Error', error: 'Order not found' });
        return;
      }
      if (!order.amount || !order.amount.value || !order.amount.currencyCode) {
        reject({ status: 'Error', error: 'Order amount is missing' });
        return;
      }
      if (!googlePayConfig) {
        reject({ status: 'Error', error: 'Google Pay configuration is missing' });
        return;
      }
      if (!googlePayConfig.merchantName) {
        reject({ status: 'Error', error: 'Merchant name is not found' });
        return;
      }
      if (!googlePayConfig.gateway) {
        reject({ status: 'Error', error: 'Gateway is not found' });
        return;
      }
      if (!googlePayConfig.gatewayMerchantId) {
        reject({ status: 'Error', error: 'Gateway merchant ID is not found' });
        return;
      }

      const orderDetails = {
        amount: (order.amount.value / 100).toFixed(2),
        currencyCode: order.amount.currencyCode
      };

      return NiSdk.initiateGooglePay(googlePayConfig, orderDetails, (status, tokenOrError) => {
        switch (status) {
          case "Success":
            resolve({ status, token: tokenOrError });
            break;
          case "Failed":
          case "Aborted":
          default:
            reject({ status, error: tokenOrError });
        }
      });
    } else {
      reject({ status: 'Not Supported', error: 'Google Pay is not supported on this platform' });
    }
  });
};

const isGooglePaySupported = (googlePayConfig) => {
  return new Promise((resolve, reject) => {
    if (Platform.OS === 'android') {
      if (!NiSdk || !NiSdk.isGooglePaySupported) {
        reject({ status: 'Not Supported', error: 'Google Pay is not available' });
        return;
      }
      const config = googlePayConfig || { environment: 'TEST' };
      NiSdk.isGooglePaySupported(config, (isSupported) => {
        resolve(isSupported);
      });
    } else {
      reject({ status: 'Not Supported', error: 'Google Pay is not supported on this platform' });
    }
  });
};

// A normalised sdk config function
const configureSDK = (config) => {
  if (!config) {
    return;
  }

  // Supported configs for android platform
  if (Platform.OS === 'android') {
    if ('shouldShowOrderAmount' in config) {
      NiSdk.configureSDK({
        shouldShowOrderAmount: config.shouldShowOrderAmount
      });
    }
  }

  // Supported configs on iOS
  if (Platform.OS === 'ios') {
    if ('language' in config) {
      NiSdk.setLocale(config.language);
    }
  }
}

const executeThreeDSTwo = (paymentResponse) => {
  return new Promise((resolve, reject) => {
    return NiSdk.executeThreeDSTwo(paymentResponse, (status) => {
      switch (status) {
        case "Success":
          resolve({ status });
          break;
        case "Failed":
        case "Aborted":
        default:
          reject({ status });
      }
    });
  })
}

// export * from './apple-pay-constants';
export {
  initiateCardPayment,
  initiateSamsungPay,
  initiateApplePay,
  initiateGooglePay,
  isSamsungPaySupported,
  isApplePaySupported,
  isGooglePaySupported,
  configureSDK,
  SDK_VERSION,
  getDeviceInfo,
  executeThreeDSTwo
};
