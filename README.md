# react-native-ni-sdk

![Banner](assets/banner.jpg)

## Requirements
- Reat-native `v0.60+`
- iOS version `11+`
- Android minSDK version `19`

## Getting started
```bash
npm i @network-international/react-native-ngenius
```

**Note:** If your project is using iOS deployment target 10, you need to increase it to 11.

In order to increase change the versions in the following files
- Change the iOS deployment version in `your-project/ios/Podfile` as follows `platform :ios, '11.0'`  
- Open the `.xcworkspacefile` inside the following directory `your-project/ios/yourproject.xcworkspace` and change the deployment target to 11.0.

## Basic usage example
```javascript
import {
  initiateCardPayment,
  initiateSamsungPay,
  initiateApplePay,
} from '@network-international/react-native-ngenius';

// order is the order response received from NGenius create order API
const makeCardPayment = async () => {
    try {
      const resp = await initiateCardPayment(order);
    } catch (err) {
      console.log({ err });
    }
};

// order is the order response received from NGenius create order API
// merchantName is the name of merchant's establishment
// serviceId is the serviceId that is generated in the Samsung Pay developer portal
const makeSamsungPayPayment = async () => {
    try {
      const resp = await initiateSamsungPay(order, merchantName, serviceId);
    } catch (err) {
      console.log({ err });
    }
};

// order is the order response received from NGenius create order API
// mid is the merchant ID that is generated in the Apple developer portal
// countryCode is the country code of the transaction country Eg: AE for UAE
const makeApplePayPayment = async () => {
    try {
      const resp = await initiateApplePay(order, mid, countryCode);
    } catch (err) {
      console.log({ err });
    }
};


```
