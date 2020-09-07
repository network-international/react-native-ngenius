import { NativeModules } from 'react-native';

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
  });
}

export { initiateCardPayment, initiateSamsungPay };
