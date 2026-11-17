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
  initiateGooglePay,
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
      const resp = await initiateApplePay(order, { // order is the order response after creating an order
        merchantIdentifier: '', // Merchant ID created in Apple's portal
        countryCode: '', // Country code of the order Eg, AE
        merchantName: '', // name of the merchant to be shown in Apple Pay button
      });
    } catch (err) {
      console.log({ err });
    }
};

const makeGooglePayPayment = async () => {
    try {
      const resp = await initiateGooglePay(order, {
        merchantName: '', // name of the merchant
        gateway: '', // gateway name
        gatewayMerchantId: '', // gateway merchant ID
        environment: 'TEST', // 'TEST' or 'PRODUCTION'
      });
    } catch (err) {
      console.log({ err });
    }
};
```

## Tabby (buy now, pay later)

A ready-made "Pay with Tabby" button. It needs `react-native-webview` in your app:

```bash
npm i react-native-webview
cd ios && pod install
```

```javascript
import { TabbyButton } from '@network-international/react-native-ngenius/tabby';

// order is the order response received from NGenius create order API (same as initiateCardPayment)
<TabbyButton
  order={order}
  onResult={({ status, error }) => {
    // 'Success'        paid
    // 'PostAuthReview' paid, under review: hold fulfilment until it clears
    // 'Failed'         declined, or the outcome could not be confirmed: check the order
    // 'Aborted'        payer backed out: nothing charged, the order is still payable
    // 'Unavailable'    Tabby would not open a checkout (amount, currency, ...): offer another method
  }}
/>
```

The button only appears when your outlet offers Tabby on the order (`TABBY` in
`paymentMethods.apm`); otherwise it renders nothing. Tabby is imported from its own entry point,
so apps that don't use it don't need `react-native-webview`.

## Tamara (buy now, pay later)

A ready-made "Pay with Tamara" button, the same as `TabbyButton`. It also needs
`react-native-webview` (see Tabby above):

```javascript
import { TamaraButton } from '@network-international/react-native-ngenius/tamara';

<TamaraButton
  order={order}
  onResult={({ status, error }) => {
    // same statuses as TabbyButton: Success, PostAuthReview, Failed, Aborted, Unavailable
  }}
/>
```

The button only appears when your outlet offers Tamara on the order (`TAMARA` in
`paymentMethods.apm`); otherwise it renders nothing. An order that offers both can show both
buttons.

## QPay (NAPS, Qatar)

A ready-made "Pay with NAPS" button. It also needs `react-native-webview` (see Tabby above):

```javascript
import { QPayButton } from '@network-international/react-native-ngenius/qpay';

<QPayButton
  order={order}
  onResult={({ status, error }) => {
    // same statuses as TabbyButton: Success, PostAuthReview, Failed, Aborted, Unavailable
  }}
/>
```

The button only appears for a QAR order on an outlet with QPay enabled (the order's payment
carries a `payment:qpay` link); otherwise it renders nothing.

## KNET (Kuwait)

A ready-made "Pay with KNET" button. It also needs `react-native-webview` (see Tabby above):

```javascript
import { KnetButton } from '@network-international/react-native-ngenius/knet';

<KnetButton
  order={order}
  onResult={({ status, error }) => {
    // same statuses as TabbyButton: Success, PostAuthReview, Failed, Aborted, Unavailable
  }}
/>
```

The button only appears for a KWD order on an outlet with KNET enabled (the order's payment
carries a `payment:knet` link); otherwise it renders nothing. After `Aborted` the same order can
be paid again, with KNET or another method.

## Benefit (Bahrain)

A ready-made "Pay with Benefit" button. It also needs `react-native-webview` (see Tabby above):

```javascript
import { BenefitButton } from '@network-international/react-native-ngenius/benefit';

<BenefitButton
  order={order}
  onResult={({ status, error }) => {
    // same statuses as TabbyButton: Success, PostAuthReview, Failed, Aborted, Unavailable
  }}
/>
```

The button only appears for a BHD `PURCHASE` order on an outlet that lists `BENEFIT` among its
card schemes; otherwise it renders nothing. While a payment is in progress on Benefit's page,
closing the sheet keeps the payer there and asks them to use Benefit's own Cancel, so a payment
Benefit is already taking is not abandoned.

## AANI (UAE)

A ready-made "Pay with AANI" button. Unlike the others it needs no WebView:

```javascript
import { AaniButton } from '@network-international/react-native-ngenius/aani';

<AaniButton
  order={order}
  onResult={({ status, error }) => {
    // same statuses as TabbyButton: Success, PostAuthReview, Failed, Aborted, Unavailable
  }}
/>
```

The button only appears when your outlet offers AANI on the order (`AANI` in
`paymentMethods.apm`). The payer enters their mobile number, Emirates ID, passport or email and
approves the request in their banking app, or (when the outlet offers it) scans a QR code. The
sheet waits up to 5 minutes for the approval.

## Quick Links

* [Basic Usage](https://github.com/network-international/react-native-ngenius/wiki/Basic-Usage)
* [Samsung Pay](https://github.com/network-international/react-native-ngenius/wiki/Samsung-Pay)
* [Samsung Pay FAQ & Troubleshooting](https://github.com/network-international/react-native-ngenius/wiki/Samsung-Pay#faq--troubleshooting)
* [Apple Pay](https://github.com/network-international/react-native-ngenius/wiki/Apple-Pay)
* [Google Pay](https://github.com/network-international/react-native-ngenius/wiki/Google-Pay)
