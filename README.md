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

## Customising the payment page

How to change the language, behaviour and colours of the N-Genius card payment page from a
React Native app, with the same result on iOS and Android.

Requires `@network-international/react-native-ngenius` **3.2.7** or later, which uses the
native iOS SDK `NISdk` 6.1.4 and the Android SDK 5.2.5. After upgrading, run
`cd ios && pod update NISdk`.

There are two parts:

1. **Language and behaviour:** set from JavaScript with `configureSDK`.
2. **Colours:** set once in each native project, through Android resources and the iOS
   `NISdkColors` object. They can't be set from JavaScript.

Anything you don't set keeps the SDK's default look.


### 1. Language and behaviour (JavaScript)

Call `configureSDK` once, before the first payment. For example, at app start:

```javascript
import { configureSDK } from '@network-international/react-native-ngenius';

configureSDK({
  language: 'ar',               // 'en' or 'ar' on both platforms; 'fr' on Android only
  shouldShowOrderAmount: true,  // show the amount on the pay button
  shouldShowCancelAlert: true,  // ask "Are you sure?" before cancelling the payment
});
```

| Option | Default | Notes |
| --- | --- | --- |
| `language` | the app's language | Arabic switches the page to right-to-left. |
| `shouldShowOrderAmount` | Android `false`, iOS `true` | The defaults differ, so **set it explicitly** to get the same result on both platforms. |
| `shouldShowCancelAlert` | `false` | |

**Android and Arabic:** the app's `android/app/src/main/AndroidManifest.xml` must declare
`android:supportsRtl="true"` on `<application>`. Without it, Android ignores right-to-left
layout for the whole app, including the payment page.


### 2. Colours

Use one palette and set each colour under its name on each platform:

| What it colours | Android colour resource | iOS `NISdkColors` property |
| --- | --- | --- |
| Pay button background | `payment_sdk_pay_button_background_color` | `payButtonBackgroundColor` |
| Pay button text | `payment_sdk_pay_button_text_color` | `payButtonTitleColor` |
| Pay button text while pressed | `payment_sdk_pay_button_text_color_highlighted` | `payButtonTitleColorHighlighted` |
| Card preview, solid colour | set the three colours below to the same value | `cardPreviewColor` |
| Card preview, gradient (left to right) | `payment_sdk_card_start_color`, `payment_sdk_card_center_color`, `payment_sdk_card_end_color` | `cardPreviewStartColor`, `cardPreviewCenterColor` (optional), `cardPreviewEndColor` |
| Card preview text | `payment_sdk_card_text_color` | `cardPreviewLabelColor` |
| Page background | `payment_sdk_page_background_color` | `payPageBackgroundColor` |
| Field labels | `payment_sdk_floating_hint_color` | `textFieldLabelColor` |
| Text typed into fields | `payment_sdk_text_field_text_color` | `textFieldTextColor` |
| Field placeholders | `payment_sdk_text_field_placeholder_color` | `textFieldPlaceholderColor` |
| Lines between fields | `payment_sdk_divider_color` | `payPageDividerColor` |
| Title bar background | `payment_sdk_toolbar_color` | `navigationBarColor` |
| Title text | `payment_sdk_toolbar_text_color` | `payPageTitleColor` |
| Title bar button (back / Cancel) | `payment_sdk_toolbar_icon_color` | `navigationBarButtonColor` |
| Loader while the order loads and during 3-D Secure | `payment_sdk_progress_loader_color` | `progressLoaderColor` |

One option exists on iOS only, because the Android page has no such element:
`payButtonActivityIndicatorColor`, the spinner inside the pay button while paying. Android shows
its payment loader instead (`payment_sdk_progress_loader_color`).

#### Android

Create (or add to) `android/app/src/main/res/values/colors.xml` in your app. A colour with
the same name as one of the SDK's replaces the SDK's value when the app is built:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="payment_sdk_pay_button_background_color">#0B5FFF</color>
    <color name="payment_sdk_pay_button_text_color">#FFFFFF</color>

    <!-- Solid card: the same colour three times -->
    <color name="payment_sdk_card_start_color">#1C1C1E</color>
    <color name="payment_sdk_card_center_color">#1C1C1E</color>
    <color name="payment_sdk_card_end_color">#1C1C1E</color>
    <color name="payment_sdk_card_text_color">#FFFFFF</color>

    <color name="payment_sdk_page_background_color">#F5F5F7</color>
    <color name="payment_sdk_floating_hint_color">#0B5FFF</color>
    <color name="payment_sdk_text_field_text_color">#111111</color>
    <color name="payment_sdk_text_field_placeholder_color">#8E8E93</color>

    <color name="payment_sdk_toolbar_color">#0B5FFF</color>
    <color name="payment_sdk_toolbar_text_color">#FFFFFF</color>
    <color name="payment_sdk_toolbar_icon_color">#FFFFFF</color>

    <color name="payment_sdk_progress_loader_color">#0B5FFF</color>
</resources>
```

Rebuild the app (`npx react-native run-android`, or build from Android Studio). Colour
resources are read at build time, so a JavaScript reload does not pick up changes.

#### iOS

Set the colours once at app launch, before the first payment, in your `AppDelegate`.

**Swift** (`ios/<YourApp>/AppDelegate.swift`, React Native 0.77 and later):

```swift
import NISdk

// in application(_:didFinishLaunchingWithOptions:)
let colors = NISdkColors()
colors.payButtonBackgroundColor = UIColor(red: 0.04, green: 0.37, blue: 1.0, alpha: 1) // #0B5FFF
colors.payButtonTitleColor = .white

colors.cardPreviewColor = UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1)        // #1C1C1E
colors.cardPreviewLabelColor = .white

colors.payPageBackgroundColor = UIColor(red: 0.96, green: 0.96, blue: 0.97, alpha: 1)  // #F5F5F7
colors.textFieldLabelColor = UIColor(red: 0.04, green: 0.37, blue: 1.0, alpha: 1)
colors.textFieldTextColor = UIColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1)      // #111111
colors.textFieldPlaceholderColor = UIColor(red: 0.56, green: 0.56, blue: 0.58, alpha: 1)

colors.navigationBarColor = UIColor(red: 0.04, green: 0.37, blue: 1.0, alpha: 1)
colors.payPageTitleColor = .white
colors.navigationBarButtonColor = .white

colors.progressLoaderColor = UIColor(red: 0.04, green: 0.37, blue: 1.0, alpha: 1)

NISdk.sharedInstance.setSDKColors(sdkColors: colors)
```

**Objective-C** (`ios/<YourApp>/AppDelegate.mm`, React Native 0.76 and earlier):

```objc
@import NISdk;

// in application:didFinishLaunchingWithOptions:
NISdkColors *colors = [NISdkColors new];
colors.payButtonBackgroundColor = [UIColor colorWithRed:0.04 green:0.37 blue:1.0 alpha:1];
colors.payButtonTitleColor = UIColor.whiteColor;
colors.cardPreviewColor = [UIColor colorWithRed:0.11 green:0.11 blue:0.12 alpha:1];
colors.cardPreviewLabelColor = UIColor.whiteColor;
colors.textFieldTextColor = [UIColor colorWithRed:0.07 green:0.07 blue:0.07 alpha:1];
colors.navigationBarColor = [UIColor colorWithRed:0.04 green:0.37 blue:1.0 alpha:1];
colors.payPageTitleColor = UIColor.whiteColor;
colors.navigationBarButtonColor = UIColor.whiteColor;
colors.progressLoaderColor = [UIColor colorWithRed:0.04 green:0.37 blue:1.0 alpha:1];
[[NISdk sharedInstance] setSDKColorsWithSdkColors:colors];
```

For a gradient card instead of a solid one, set `cardPreviewStartColor` and
`cardPreviewEndColor` (and optionally `cardPreviewCenterColor`). Use the same colours as
Android's `payment_sdk_card_start_color` / `_center_color` / `_end_color`.


### Not supported

None of the following can be customised on either platform:

- Fonts.
- A logo or background image on the card preview.
- The loader's animation or shape. Only its colour can change.

## Quick Links

* [Customising the payment page](#customising-the-payment-page): language, behaviour and colours on iOS and Android
* [Basic Usage](https://github.com/network-international/react-native-ngenius/wiki/Basic-Usage)
* [Samsung Pay](https://github.com/network-international/react-native-ngenius/wiki/Samsung-Pay)
* [Samsung Pay FAQ & Troubleshooting](https://github.com/network-international/react-native-ngenius/wiki/Samsung-Pay#faq--troubleshooting)
* [Apple Pay](https://github.com/network-international/react-native-ngenius/wiki/Apple-Pay)
* [Google Pay](https://github.com/network-international/react-native-ngenius/wiki/Google-Pay)
