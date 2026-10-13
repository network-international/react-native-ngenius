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

## Tokenization

This is **not** production-ready saved-card tokenization. Existing payment API names, signatures and normal-path behavior are unchanged; see [Existing payment APIs](#existing-payment-apis) for one iOS hardening change.

Backend contracts: `add-card-api.json`, `add-wallet-api.json` and `saved-tokens-api.json` (received 9 Oct 2026).

### Existing payment APIs

On iOS, `initiateCardPayment` and `initiateApplePay` now wait for the presenting screen to be free before showing the native sheet. When nothing else is presented (the normal path), behavior is unchanged. When another screen is still presented or dismissing, the bridge retries for up to about 2 seconds, then presents the sheet or rejects with `{ status: 'Failed' }`. Previously UIKit could silently drop the presentation, leaving the promise unsettled. Android and all other payment APIs are unchanged.

### Status

| Area | Status |
| --- | --- |
| Saved tokens / T&C (`GET /api/outlets/{outletRef}/tokens`) | Implemented in the client; used as the **POC initialization call** for `tncUrl`. The final production init contract is pending a backend spec update. |
| Google Pay (`POST /api/outlets/{outletRef}/wallets`) | Implemented in JS; not validated on an Android device |
| Card (`POST /api/outlets/{outletRef}/cards`) | Modelled only; must be submitted by the native secure layer |
| Apple Pay | Pending: the iOS bridge does not return the payment token |
| 3DS (`.../3ds2/authentications`, `.../3ds2/challenge-response`) | Experimental client methods only; native 3DS continuation not complete |
| Base URLs | Pending: no environment URL ships with the SDK |

### Authentication (`Access-Token`)

The merchant backend calls the identity access-token endpoint with its API key and passes the short-lived token to the app. The SDK asks for it just in time through `getAccessToken` and sends it as the `Access-Token` header. The token is never stored, refreshed or logged. Never put an API key or Basic credentials in the mobile app.

If `getAccessToken` rejects or returns no token, the call fails with `TokenizationApiError` code `ACCESS_TOKEN_UNAVAILABLE` and no request is sent.

### Tokenization API client

```javascript
import { createTokenizationClient } from '@network-international/react-native-ngenius';

const tokenizationClient = createTokenizationClient({
  baseUrl, // required; confirmed URLs are pending
  getAccessToken: async () => merchantBackend.getTokenizationAccessToken(),
});

// T&C and saved tokens. `tokens` is sent as repeated query parameters.
const { tokens, tncUrl } = await tokenizationClient.getSavedTokens({
  outletRef,
  tokens: ['tok_1', 'tok_9'], // optional
  consentOff: false, // optional
});

// Wallet token, passed through exactly as the wallet returned it.
const savedToken = await tokenizationClient.addWallet({
  outletRef,
  walletType: 'GOOGLE_PAY',
  encryptedPayload: googlePayToken,
});

// EXPERIMENTAL, integration-level only: 3DS continuation for AWAIT_3DS.
// The SDK does not run the 3DS method/challenge steps yet; native 3DS
// continuation is not complete, so this is not end-to-end supported.
await tokenizationClient.authenticateThreeDS({
  outletRef, tokenRef, orderReference, paymentReference,
  threeDSCompInd: 'Y', // Y, N or U
  browserInfo,
});
await tokenizationClient.submitThreeDSChallengeResponse({
  outletRef, tokenRef, orderReference, paymentReference,
  base64EncodedCRes,
});
```

Responses are parsed `SavedCardResponse` objects: `tokenRef`, `type` (`CARD` or `WALLET`), `walletType` (wallets only), `status`, `cardDetails` (`scheme`, `last4`, `expiry`, optional `cardholderName`), plus `orderReference`, `paymentReference` and `threeDS2` (from the `3ds2` field) where returned.

| Status | Meaning |
| --- | --- |
| `VERIFIED` | Terminal success. The token can be used. |
| `AWAIT_3DS` | A `tokenRef` already exists but is **not** verified. Continue with the 3DS endpoints. |
| `FAILED` | Verification failed (seen in saved-token lists). |

There is no JS card create method: PAN and CVV must never cross the React Native bridge, so `POST /cards` is a native dependency.

Errors are `TokenizationApiError` `{ status, code, message, errors }`. `code` is the first backend `errorCode` (for example `invalidWalletType`, `walletVerificationFailed`, `cardVerificationFailed`) or a fallback by HTTP status. `errors` keeps only `message`, `localizedMessage`, `errorCode` and `domain`. Other codes: `ACCESS_TOKEN_UNAVAILABLE`, `NETWORK_ERROR`, `MALFORMED_RESPONSE`.

### Component

```javascript
import { NgeniusTokenization } from '@network-international/react-native-ngenius';

<NgeniusTokenization
  visible={showTokenization}
  order={order}
  branding={branding}
  paymentMethods={['CARD', 'APPLE_PAY', 'GOOGLE_PAY']}
  consentOff={false}
  language="en"
  tokenizationClient={tokenizationClient} // optional
  outletRef={outletRef} // optional
  applePayConfig={{ merchantIdentifier, countryCode, merchantName }}
  googlePayConfig={{ merchantName, gateway, gatewayMerchantId, environment }}
  onSuccess={(result) => {}}
  onError={(error) => {}}
  onCancel={() => setShowTokenization(false)}
/>
```

With `tokenizationClient` and `outletRef`:

- On open (consent on), the component calls `getSavedTokens({ outletRef })` without `tokens` and uses the returned `tncUrl` for the consent link. This is the current **POC initialization path**, not the final production init contract.
- Google Pay sends the wallet token to `POST /wallets`. Only `VERIFIED` calls `onSuccess` with `{ flow, method, status: 'VERIFIED', niTokenCreated: true, savedToken: { tokenRef, type, walletType, status, cardDetails } }`.
- `AWAIT_3DS` is not success. Until the native 3DS runner exists, the attempt ends in a controlled pending state: the shopper sees a message and `onError` receives `{ status: 'AWAIT_3DS', code: 'THREE_DS_CONTINUATION_UNAVAILABLE', niTokenCreated: false, savedToken: null }`.
- Failures call `onError` with `{ status: 'FAILED', code, error, niTokenCreated: false }`.

Without them, Google Pay keeps the native demo result. Card and Apple Pay always open the existing native screens and return `niTokenCreated: false`. `force3DS` is not exposed and is never sent for wallets.

`branding` uses the real paypage contract only: `buttonColour`, `buttonRolloverColour`, `paymentFontColour`, `mainHeadingColour`, `pageBackgroundColour`, `backgroundColour`, `languages[].bodyCopyFont` / heading fonts, and logo fallback (`logoUrl` → `merchantLogoUrl` → `tenantLogoUrl` → `footerImageUrl` → `faviconUrl`). Geometry (56px buttons, 8–12px radii) is a local design-system default, not a backend field.

Language fonts: the component `language` prop is matched against `languages[].language`, then `languages[0]`, then design-system defaults. Arabic uses `Arial`. Merchant font names are **best-effort**: they are passed as `fontFamily` only if present. The host app must install/register that font.

### Consent information

Consent is NI-owned PayPage EN/FR/AR text. Only strict `consentOff === true` removes its block, links and spacing. False, omitted or invalid values retain it. A missing order selects standard text; recurring/reusable orders use the PayPage selectors. Merchant text and `customizedMessage` cannot replace consent.

T&C source resolution (invoice config `tncUrl`, then transaction `termsAndConditions`) is resolved on the backend. The POC initialization path is implemented with `getSavedTokens`. The final production delivery contract (init response/container) is pending a backend spec correction.

Agreed behavior:

- `consentOff === true`: no saved-tokens/T&C request, no consent, no `tncUrl` required.
- `consentOff` false or omitted: the POC calls `getSavedTokens({ outletRef })` and expects `{ tokens: [], tncUrl }`. Zero saved tokens is valid.

The supplied `saved-tokens-api.json` still contradicts this: it marks `tokens` as required (`missingField`) and describes `tncUrl` as returned when `consentOff=true`. Until the backend spec is corrected, a live backend may reject the zero-token call; consent then remains visible without a link.

While the URL is loading, or if it is missing, invalid or the request fails, consent stays visible with plain Terms. A valid HTTP(S) URL opens through `Linking.canOpenURL` / `openURL`, preserving query and fragment. Internal diagnostic codes never become shopper errors.

See [the preserved source audit and final decisions](docs/paypage-consent.md) and [implementation/validation notes](docs/tokenization-implementation.md).

### Exact component props

`visible = false`, `order`, `paymentMethods`, `branding`, `language = 'en'`, `consentOff = false`, `tokenizationClient`, `outletRef`, `applePayConfig`, `googlePayConfig`, `onSuccess`, `onError`, `onCancel`.

`paymentMethods` is an explicit array containing only requested `CARD`, `APPLE_PAY`, `GOOGLE_PAY`; the SDK also filters by native platform/capability. Other methods are ignored. Saved tokens are not payment methods and are not shown as methods. The final omitted-prop behavior is undefined by Product. The POC retains existing POC order-based fallback for compatibility, without declaring a new default. The demo always passes all three explicitly. An empty explicit list enables none.

No public `tncUrl`, `orderData`, URL provider, custom consent, `merchantAttributes`, `keyId`, or `publicKey` prop is introduced. JWE (`encryptedPayload` for cards) is not implemented.

### Native card screen (PCI)

PAN/CVV stay in the existing native card UI. The themed tokenization container does **not** collect card numbers in React Native `TextInput`s.

- **iOS NISdk 6.1.2:** `NISdk.setSDKColors(sdkColors:)` is a public `@objc` API. Colour fields on `NISdkColors` are public Swift `UIColor` vars, not Objective-C properties. This package sets those Swift fields, then restores defaults after the card sheet.
- **Android payment-sdk 5.2.3:** no runtime merchant theme API.

### Demo

`SimpleIntegration`: **Open tokenization** plus **Default theme / Merchant branding**. Existing Pay buttons are unchanged. The demo creates a **SALE** order and does not ship JWT or API keys. Its tokenization client uses a demo-only in-memory transport: saved tokens return `{ tokens: [], tncUrl }` with an `example.com` URL, and every other endpoint fails. No backend is called.

## Quick Links

* [Basic Usage](https://github.com/network-international/react-native-ngenius/wiki/Basic-Usage)
* [Samsung Pay](https://github.com/network-international/react-native-ngenius/wiki/Samsung-Pay)
* [Samsung Pay FAQ & Troubleshooting](https://github.com/network-international/react-native-ngenius/wiki/Samsung-Pay#faq--troubleshooting)
* [Apple Pay](https://github.com/network-international/react-native-ngenius/wiki/Apple-Pay)
* [Google Pay](https://github.com/network-international/react-native-ngenius/wiki/Google-Pay)
