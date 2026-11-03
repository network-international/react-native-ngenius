# React Native N-Genius SDK

React Native bindings for N-Genius card and wallet payments, with a tokenization POC for the add-card and wallet UI.

## Requirements
- iOS `15.0+` (NISdk 6.1.6)
- Android minSdk `21` (payment-sdk 5.2.7)
- React Native: tested with 0.79. On Android the app must use Android Gradle Plugin 8 or later;
  older templates on AGP 7.x (for example React Native 0.70 with AGP 7.2.1) fail to build the SDK.

## Getting started
```bash
npm i @network-international/react-native-ngenius
cd ios && pod install
```

If `pod install` reports that no spec satisfies `NISdk`, your local CocoaPods index is older than
the release: run `pod install --repo-update` instead.

When upgrading from an earlier version, run `cd ios && pod update NISdk`, because the package pins
an exact NISdk version.

**iOS deployment target:** NISdk needs iOS 15.0 or later. If your app targets an older version,
set `platform :ios, '15.0'` in `ios/Podfile` and the deployment target of your app target in Xcode
to 15.0 or later.

**Android:** no extra setup is needed. The Android SDK is downloaded from JitPack automatically.


## Usage

```jsx
import {
  initiateCardPayment,
  createTokenizationClient,
  NgeniusTokenization,
} from '@network-international/react-native-ngenius';

const payment = await initiateCardPayment(order);

const tokenizationClient = createTokenizationClient({
  baseUrl: tokenizationBaseUrl,
  getAccessToken: () => merchantBackend.getTokenizationAccessToken(),
});
const { tokens } = await tokenizationClient.getSavedTokens({ outletRef, skipConsent: true });

<NgeniusTokenization
  visible={showTokenization}
  order={order}
  paymentMethods={['CARD', 'APPLE_PAY', 'GOOGLE_PAY']}
  tokenizationClient={tokenizationClient}
  outletRef={outletRef}
  branding={branding}
  language="en"
  skipConsent={true}
  applePayConfig={{ merchantIdentifier, countryCode, merchantName }}
  googlePayConfig={{ merchantName, gateway, gatewayMerchantId, environment }}
  onSuccess={handleResult}
  onError={handleError}
  onCancel={() => setShowTokenization(false)}
/>
```

`order` supplies display/wallet amount and currency context; native Card tokenization does not require a PAYMENT order. Pass an explicit `paymentMethods` list; wallets also require native device support. `branding` accepts PayPage branding fields. Custom fonts must be registered by the host app.

With a client and `outletRef`, opening calls `getSavedTokens` in both consent modes and loads `tncUrl`. With `skipConsent={false}` (default), the unchecked checkbox must be accepted before Card or wallets can start. `skipConsent={true}` hides the entire consent block and enables actions immediately. Acceptance resets on close/reopen. Missing or invalid URLs leave the consent text visible without a link.

## Supported methods

- Payments: `initiateCardPayment(order)`, `initiateSamsungPay(order, merchantName, serviceId)`, `initiateApplePay(order, applePayConfig)`, `initiateGooglePay(order, googlePayConfig)`.
- Helpers: `isSamsungPaySupported(serviceId)`, `isApplePaySupported()`, `isGooglePaySupported(googlePayConfig)`, `configureSDK(config)`, `executeThreeDSTwo(paymentResponse)`.
- Tokenization UI: `CARD`, `APPLE_PAY` (iOS), `GOOGLE_PAY` (Android).
- Tokenization client: `getSavedTokens({ outletRef, skipConsent })`, `addWallet({ outletRef, walletType, encryptedPayload })`. `authenticateThreeDS` and `submitThreeDSChallengeResponse` are experimental.

## Authentication

Supply a tokenization `baseUrl` and `getAccessToken`. Your backend obtains the short-lived identity token; the SDK requests it for each call and sends it in `Access-Token`. It does not store, refresh or log the token. Keep API keys and Basic credentials on your backend. An unavailable token fails with `ACCESS_TOKEN_UNAVAILABLE` before sending a request.

## POC status

- Current sandbox QA uses `skipConsent=true`, mapping to `GET /api/outlets/{outletRef}/tokens?consentOff=true`. Empty `tokens`, pagination metadata and omitted `tncUrl` are supported. The UI displays masked saved-method details and refreshes after VERIFIED.
- SimpleIntegration has a runtime short-lived Access-Token input (memory only) and a separate offline UI preview. Tokenization entry does not create a PAYMENT order or exchange an API key. EN/FR/AR and merchant theme controls are available on both platforms.
- Apple Pay has a separate native capture method returning only the original encrypted `PKPaymentToken.paymentData`. Android returns the raw Google Pay `tokenizationData.token`. PAYMENT APIs remain separate.
- Consent uses Hossam’s confirmed 26 October contract. Both statuses include UTC clientTimestamp, channel, actual SDK version and basic React Native device metadata. NOT_COLLECTED uses merchantSelectedSkipConsent=true; COLLECTED includes the acceptance-event time, normalized locale and the validated terms URL shown to the shopper. Unknown fields and identifiers are stripped. No IP or server timestamp is supplied by the SDK.
- Card tokenization is native on iOS and Android. Native entry, validation and HTTPS POST use `/api/outlets/{outletRef}/cards` with `{ card, consentData }`. JS receives a ready event, obtains fresh auth and prepares consent; PAN/CVV stay native. Only safe response fields return to JS. Redirects, response-body errors and credential persistence are disabled. Existing PAYMENT APIs stay separate.
- Apple/Google capture connects to the real `/wallets` JSON body with the confirmed consentData and unchanged encryptedPayload. There is no consent placeholder or missing-contract block. Live E2E still requires current sandbox credentials and supported devices/UAT wallet config.
- Custom JS transports/fetch mocks apply to JS API calls. They cannot carry plaintext cards; native Card submission is refused when such an override is installed. Offline preview can open/cancel the form, but never POSTs it.
- Only VERIFIED creates a success callback. AWAIT_3DS stays pending; Card 3DS is outside Drop 1. No new continuation flow was added.
- Live `consentOff=false` is not part of current QA. Its backend deployment and final `tncUrl` behavior remain backend-owned.

## Test and demo

```sh
npm install
npm test -- --runInBand --watchman=false
npm pack --dry-run

cd SimpleIntegration
npm install
(cd ios && pod install)
npm start
```

With Metro running, use `npm run ios` or `npm run android` from `SimpleIntegration` in another terminal. Android also has `./start-android.sh`. Use the approved test environment configuration and follow [the manual checklist](SimpleIntegration/FOR_TESTERS.md).

[Canonical documentation in Confluence](https://networkinternational.atlassian.net/wiki/spaces/NING/pages/5451218947/React+Native+Tokenization+-+POC+Architecture+Implementation+Notes).

## Customising the payment page

How to change the language, behaviour and colours of the N-Genius card payment page from a
React Native app, with the same result on iOS and Android.

Requires `@network-international/react-native-ngenius` **3.2.9** or later, which uses the
native iOS SDK `NISdk` 6.1.6 and the Android SDK 5.2.7. After upgrading, run
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
| Pay button background before the card details are complete | `payment_sdk_pay_button_disabled_background_color` | `payButtonDisabledBackgroundColor` |
| Pay button text before the card details are complete | `payment_sdk_pay_button_disabled_text_color` | `payButtonDisabledTitleColor` |
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

The page follows the device's light or dark setting. Colours you leave unset use the SDK's
defaults for each mode; colours you set are used as given in both modes. To keep the page light
only, force light mode on your app (Android `AppCompatDelegate.setDefaultNightMode`, iOS
`overrideUserInterfaceStyle` on the window).

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
