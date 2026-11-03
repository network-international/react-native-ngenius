import { NativeModules, Platform } from 'react-native';
// import { SHIPPING_CONTACT_FIELDS, MERCHANT_CAPABILITIES, BILLING_CONTACT_FIELDS } from './apple-pay-constants';
import NgeniusTokenization from './src/tokenization/NgeniusTokenization';
import {
  initiateCardPayment,
  initiateSamsungPay,
  initiateApplePay,
  initiateGooglePay,
  isSamsungPaySupported,
  isApplePaySupported,
  isGooglePaySupported,
} from './src/nativePayments';

const {
  createTokenizationClient,
} = require('./src/tokenization/api/TokenizationClient');
const { TokenizationApiError } = require('./src/tokenization/api/errors');

const { NiSdk } = NativeModules;

export const SDK_VERSION = '3.2.9';

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


// A normalised sdk config function
const configureSDK = (config) => {
  if (!config) {
    return;
  }

  // Same options on both platforms.
  const nativeConfig = {};
  if ('shouldShowOrderAmount' in config) {
    nativeConfig.shouldShowOrderAmount = config.shouldShowOrderAmount;
  }
  if ('shouldShowCancelAlert' in config) {
    nativeConfig.shouldShowCancelAlert = config.shouldShowCancelAlert;
  }

  if (Platform.OS === 'android') {
    if ('language' in config) {
      nativeConfig.language = config.language;
    }
    if (Object.keys(nativeConfig).length > 0) {
      NiSdk.configureSDK(nativeConfig);
    }
  }

  if (Platform.OS === 'ios') {
    if ('language' in config) {
      NiSdk.setLocale(config.language);
    }
    if (Object.keys(nativeConfig).length > 0) {
      NiSdk.configureSDK(nativeConfig);
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
  executeThreeDSTwo,
  NgeniusTokenization,
  createTokenizationClient,
  TokenizationApiError,
};
