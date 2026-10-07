import { NativeModules, Platform } from 'react-native';
// import { SHIPPING_CONTACT_FIELDS, MERCHANT_CAPABILITIES, BILLING_CONTACT_FIELDS } from './apple-pay-constants';
import {
  initiateCardPayment,
  initiateSamsungPay,
  initiateApplePay,
  initiateGooglePay,
  isSamsungPaySupported,
  isApplePaySupported,
  isGooglePaySupported,
} from './src/nativePayments';

const { NiSdk } = NativeModules;

export const SDK_VERSION = '3.2.0';

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
  executeThreeDSTwo
};
