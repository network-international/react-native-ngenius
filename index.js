import { NativeModules, Platform } from 'react-native';
// import { SHIPPING_CONTACT_FIELDS, MERCHANT_CAPABILITIES, BILLING_CONTACT_FIELDS } from './apple-pay-constants';

const { NiSdk } = NativeModules;

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

const isSamsungPaySupported = () => {
  return new Promise((resolve, reject) => {
    if (Platform.OS === 'android') {
      // Native impl
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
  isSamsungPaySupported,
  isApplePaySupported,
  configureSDK,
  executeThreeDSTwo
};
