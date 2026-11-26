# React Native N-Genius SDK

React Native bindings for N-Genius card and wallet payments, with a tokenization POC for the add-card and wallet UI.

## Requirements
- iOS `15.0+` (NISdk 6.1.6)
- Android minSdk `21` (payment-sdk 5.2.7)
- React Native: tested with 0.79. On Android the app must use Android Gradle Plugin 8 or later;
  older templates on AGP 7.x (for example React Native 0.70 with AGP 7.2.1) fail to build the SDK.

## Getting started
```bash
npm i @network-international/react-native-ngenius 'react-native-svg@>=9.13.6 <16'
cd ios && pod install
```

`react-native-svg` is a required peer for the PayPage scheme artwork. Choose a version in that
range that also supports your app's React Native version, then rebuild the native app. This
also applies to payment-only consumers because the package exports load the tokenization UI.
The React Native 0.70.3 SimpleIntegration example pins `react-native-svg` 13.4.0.

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
  createTokenizationClient,
  NgeniusTokenization,
} from '@network-international/react-native-ngenius';

const tokenizationClient = createTokenizationClient({
  baseUrl: tokenizationBaseUrl,
  getAccessToken: () => merchantBackend.getTokenizationAccessToken(),
});

<NgeniusTokenization
  visible={showTokenization}
  tokenizationClient={tokenizationClient}
  outletRef={outletRef}
  sessionRef={sessionRef}
  branding={merchantBranding}
  onResult={result => {
    if (result.statusCode === 200 && result.sessionID) handleSelectedSession(result.sessionID);
    else if (result.statusCode === 499) setShowTokenization(false);
    else handleTokenizationIssue(result);
  }}
/>
```

This is the complete Card setup. The amount, order summary and allowed methods and card schemes
come from Get Session for `sessionRef`; do not repeat them in the props. `branding` is optional and
accepts PayPage branding fields. Register custom fonts in the host app.

To show the optional return action, pass `paymentMethods={['CONTINUE_SHOPPING']}`. A list that
contains only `CONTINUE_SHOPPING` does not narrow the session methods.

`order` and `orderDetails` are optional legacy context for language, consent wording and native
wallet context. Their amount, summary and methods are ignored. Wallet capture uses zero in the
currency supplied by the current Get Session response; a missing or invalid session currency
prevents capture. Native Card tokenization does not need these legacy props.

Pass wallet configuration as optional props when opening `NgeniusTokenization`:

- `APPLE_PAY` uses `applePayConfig` with `merchantIdentifier` and `countryCode`, plus optional
  `merchantName`. The merchant ID must be in the iOS app's Apple Pay entitlements.
- `GOOGLE_PAY` uses `googlePayConfig` with `merchantName`, `gateway`, `gatewayMerchantId`
  and `environment` (`TEST` or `PRODUCTION`). Provide `merchantId` in production.

Get Session decides which methods are offered (see [Order details and methods](#order-details-and-methods)).
The `paymentMethods` prop can only narrow that set. A wallet is shown only when Get Session lists it,
on its platform (Apple Pay on iOS, Google Pay on Android), when the device supports it, and when the
client declares `supportsAddWallet: true` with a working `addWallet`. The built-in client still
depends on the session-based Add Wallet endpoint, so it currently offers cards only.

The merchant backend creates the tokenization session with any returning shopper token references
in `advisedTokens` and, for order context, `orderDetails` with the required `action` and `amount`,
and passes the returned `session_id` to the app as `sessionRef`. Open the chooser with that
reference. The SDK starts with Get Session to load the saved methods, `tncUrl` and optional order details. Add and Select
reuse the same reference, and Add updates the list directly from its response.

Omit `modeConfig.tokenType` to use `PERMANENT`. For a one-time token, pass
`modeConfig={{ tokenType: 'ONCE_OFF' }}`. The SDK sends this value as `usageType` on Add Card
or Add Wallet and rejects an invalid explicit value with `INVALID_USAGE_TYPE`.

Set `modeConfig.addCardsBeforePay` to enable **Add new card**. Each verified card returns
the shopper to the method list in the same session. The shopper can add another card,
choose a card from the list, and tap **Pay** to confirm the selection.

With `skipConsent={false}` (default), the native Card form displays Terms and Conditions below
the card form's submit button and records acceptance after valid input. Wallet actions display
terms below the wallet buttons and record acceptance on the wallet tap. `skipConsent={true}` sends `?consentOff=true`
on Get Session and `NOT_COLLECTED` with `skippedByMerchant: true` on Add. A valid terms URL
makes the terms label a link.

The default **Select payment method** chooser slides up as a bottom sheet. While the session loads,
it shows placeholders for the payment methods. If initialization fails, the SDK closes and
reports the error to the host via `onResult`. Tap outside or swipe down to dismiss the sheet.
In fullscreen, use **Cancel** or **Close**. Saved methods show masked funding details and
`MM/YY` when supplied. Failed methods are hidden. The native Card form follows the chooser's
presentation mode. In bottom-sheet mode it opens at the same height as the chooser on iOS
and Android. The form scrolls inside the sheet when the keyboard is open.

```jsx
modeConfig={{
  presentation: 'bottomSheet', // or 'fullscreen'
  backdropBlur: true, // use blur where supported, dim the backdrop otherwise
  sectionOrder: ['tokens', 'wallets', 'card'],
  showSecurityNote: true, // opt in to the card security note
  returnButtonName: 'Continue shopping', // with CONTINUE_SHOPPING in paymentMethods
  returnButtonStyle: 'button',
  labels: {
    pageTitle: 'Select payment method',
    payByCard: 'Pay by card',
    pay: 'Pay',
  },
}}
```

### Order details and methods

The checkout shows the order details and methods returned by **Get Session** once loading
completes. The SDK reads the saved methods from `advisedTokens`, the allowed methods from the
top-level `paymentMethods`, and `amount` and `orderSummary` from `orderDetails`. Each is optional
except the token list.

```js
const getSessionResponse = {
  advisedTokens: [],
  tncUrl: 'https://merchant.example/terms',
  paymentMethods: {
    card: ['VISA', 'MASTERCARD'],
    wallet: ['APPLE_PAY', 'GOOGLE_PAY'],
  },
  orderDetails: {
    action: 'AUTH',
    amount: { currencyCode: 'AED', value: 3910 },
    orderSummary: {
      items: [{
        description: 'General admission',
        quantity: 2,
        category: 'Tickets',
        totalPrice: { currencyCode: 'AED', value: 3000 },
      }],
      shipping: { currencyCode: 'AED', value: 500 },
      tax: { currencyCode: 'AED', value: 410 },
      total: { currencyCode: 'AED', value: 3910 },
    },
  },
};
```

For compatibility with earlier UAT responses, a response without `advisedTokens` reads `tokens`,
and a response without `orderDetails` reads top-level `amount` and `orderSummary`. If
`orderDetails` is present, the top-level amount and summary are ignored. A `paymentMethods`
object inside `orderDetails` is not part of the contract and is ignored. Add Card responses
follow the same `advisedTokens` rule.

`paymentMethods.card` lists the schemes shown on the card form. If the response omits
`paymentMethods` or returns `paymentMethods: {}`, the card form remains available without
scheme logos. An explicit `card: []` still disables adding a card. In a nonempty configuration,
a missing or malformed list allows nothing for that method. `paymentMethods.wallet` lists the
allowed wallets; an empty configuration does not enable wallets.

The card-entry form shows grouped digits by default, matching PayPage. Get Session
can explicitly enable PAN masking with `maskPaymentInfo: true` (or `'true'`), also
read from the legacy `order.merchantAttributes.maskPaymentInfo` setting. An absent
setting or `false` keeps entered digits visible. Saved-card details and CVV remain masked.

Money accepts `{ currencyCode, value }`, where `value` is a nonnegative integer in minor units,
as a safe integer number or a digit string. For example, AED `'3910'` displays as AED 39.10;
currency precision follows the supplied ISO currency. If `value` is absent, `formattedValue`
may supply a canonical major-unit decimal string such as `'39.10'`, without currency text or
grouping. When both are supplied, `value` wins. Invalid or incomplete money is omitted.

The summary starts collapsed; `modeConfig.orderSummaryInitiallyExpanded: true` opens its details
initially. Its header prefers the supplied summary total, then amount. Missing amounts, currency,
items, quantities, fees and totals are never inferred, summed or converted. The summary stays hidden
during loading, while a checkout error is shown, and when Get Session returns no usable order details.
Language resolves from supported `language`, then
`orderDetails.language`, then `order.language`, then English (EN/FR/AR, including region tags).

### Confirm a method and hand off to the merchant

The shopper selects an existing token and taps **Pay**, or completes the native Card form and taps
**Pay** there. For a new method, the SDK verifies that the Add response identifies one new eligible
token by comparing the complete before and after lists. It submits
`PUT /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}/selected-payment-data`
with `{ tokenRef }` and shows progress while it waits for acknowledgement. For both new and
saved cards, the SDK closes and reports the result as soon as the selection is acknowledged,
with no separate success screen. Payment itself happens later through the merchant backend.
If verification or selection fails, the chooser shows the error and remains available when the
session can still be used. The merchant backend uses the confirmed session reference to start payment.

The client operation remains named `selectToken` for compatibility. It accepts an optional
`currency` (three uppercase letters) and sends `{ tokenRef, currency }` when supplied. It never
infers a currency from initialization props or retries the earlier route after an error.
This route and `{ tokenRef, currency }` example are documented in the
[Tokenization API Specification v29](https://networkinternational.atlassian.net/wiki/spaces/NING/pages/5230821378).
UAT route validation returned the expected `400 tokenNotInSession` for a token outside a fresh
empty session. Successful selection and currency persistence still require an eligible token
and configured outlet. The checkout UI does not yet offer MCP currency selection.
Get Session's boolean `isMcpSelected` is retained by the client, but it is not an eligibility
flag, a currency list or a conversion quote. See [wallet and MCP delivery dependencies](docs/wallet-mcp-delivery.md).

`onResult` receives `{ statusCode, message, sessionID? }`. `sessionID` is the merchant session reference
and is omitted if the session could not be initialized. `200` means token selection is confirmed.
`499` means the shopper or host dismissed the SDK, with a message identifying how it closed.
`401` means authentication failed during initialization and `402` means authentication expired
after opening. Other failure codes report the failed operation. Recoverable errors are emitted
while the SDK is still open and can be followed by a successful result or dismissal. Start payment
only on `200`. Use either `onResult` or the existing `onSelectionComplete` for the payment handoff.

`408` means the request timed out and its outcome could not be confirmed. Initialization timeout
closes the SDK and omits `sessionID`. A timeout after initialization displays a localized message,
disables further actions and reports the known session reference. Closing that screen does not
replace the timeout with a cancellation result. The merchant must check the session before retrying;
the SDK never automatically repeats Add or Select after a timeout.

## Supported methods

- Payments: `initiateCardPayment(order)`, `initiateSamsungPay(order, merchantName, serviceId)`, `initiateApplePay(order, applePayConfig)`, `initiateGooglePay(order, googlePayConfig)`.
- Helpers: `isSamsungPaySupported(serviceId)`, `isApplePaySupported()`, `isGooglePaySupported(googlePayConfig)`, `configureSDK(config)`, `executeThreeDSTwo(paymentResponse)`.
- Tokenization UI: `CARD`, `APPLE_PAY` (iOS), `GOOGLE_PAY` (Android).
- Tokenization client: `getSession`, `selectToken`, and the backend-pending `addWallet` contract. `authenticateThreeDS` and `submitThreeDSChallengeResponse` are experimental.

## Authentication

`createTokenizationClient({ baseUrl, getAccessToken })` creates the HTTP adapter for the session
routes. `getAccessToken` is your provider of the short-lived Tokenization SDK token: your backend
uses its API key to issue the token, and the app returns it from this function. The SDK calls the
provider for each request and sends the token in `Access-Token`. It does not store, refresh or log the token.
Keep API keys, Basic credentials and token issuance on your backend. An unavailable token fails
with `ACCESS_TOKEN_UNAVAILABLE` before sending a request.

The built-in client gives credential resolution, sending and reading a response one shared
30-second deadline. It attempts to abort a timed-out request when the runtime supports it, and
ignores late completion even when the transport cannot abort. A credential provider resolving
after the deadline cannot send a late request. Native Card credential preparation has its own
30-second deadline; native HTTP connect/read limits remain separate. HTTP `408`/`504` and native
request timeouts are returned as a sanitized `REQUEST_TIMEOUT` error.

## POC status

- SimpleIntegration has a short-lived Access-Token input and an offline UI preview. Sandbox QA uses
  `skipConsent=true`. An empty Get Session token list or an omitted `tncUrl` is valid.
- iOS and Android submit Add Card from the native form. PAN and CVV remain native. The SDK receives
  allowlisted token list fields. Custom JS transports support the offline chooser, where the native
  form can open, cancel, and preview verification and selection without sending HTTP.
  Card 3DS remains outside this POC.
- The Add Wallet mapper preserves the original encrypted payload. The built-in client reports
  `ADD_WALLET_BACKEND_PENDING` before wallet capture until the session-based backend endpoint is
  available. Legacy payment wallet APIs remain separate.
- The [tokenization contract](docs/tokenization-contract.md) lists the session routes and consent fields.

## Test and demo

SimpleIntegration opens **Settings** first. Enter the environment base URL, outlet ID, SDK
Access-Token and session reference, then tap **Open merchant demo**. The separate Merchant
screen has **Choose payment method** and **‹ Settings** to return and correct the configuration.
Live fields have no prefilled merchant values. Offline UI preview uses explicitly labelled
synthetic cards and order data; it sends no payment requests. The older direct-payment sample
is not part of this demo entry.

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
