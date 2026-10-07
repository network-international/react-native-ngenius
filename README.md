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

This is **not** production-ready saved-card tokenization. Existing payment APIs are unchanged. `API Specs V1.json` is the implementation contract. V1 `PaymentMethodResponse` does **not** include `usageType` or `authType`.

### Available now

- `NgeniusTokenization` UI POC (paypage-app-2 layout, branding, native CARD/Apple Pay/Google Pay **demonstration**)
- `createTokenizationClient` for the tokenization HTTP API
- Client operations: `listPaymentMethods`, `getPaymentMethod`, `validatePaymentMethod`, `deletePaymentMethod`
- Client create methods: `createCardPaymentMethod`, `createWalletPaymentMethod` (OpenAPI-shaped; **not** used by the UI)

### Not connected yet

- Secure CARD create (`POST /payment-methods/card` from the RN UI)
- Apple Pay token creation (`POST /payment-methods/wallet`)
- Google Pay token creation (`POST /payment-methods/wallet`)

### Waiting for backend/native contract

- PCI-safe handling of `CreateCardRequest` (PAN/CVV must not cross the RN bridge)
- Wallet payload transformation into `dan` / `onlinePaymentCryptogram`
- Mobile auth / `X-API-Key` model (whether the restricted key may exist on device)

### Tokenization API client

Do not put JWT or API keys in `configureSDK`, AsyncStorage, demo fixtures, or component state. `getAuth()` is called **just-in-time** for each request.

```javascript
import {
  createTokenizationClient,
} from '@network-international/react-native-ngenius';

const client = createTokenizationClient({
  environment: 'uat', // or 'production' — TOKENIZATION_ENVIRONMENTS
  getAuth: async () => {
    const session = await merchantBackend.getTokenizationAuth();
    return {
      accessToken: session.accessToken,
      apiKey: session.apiKey, // omit if a BFF injects X-API-Key
    };
  },
});

await client.listPaymentMethods({ outletId, consumerId });
await client.getPaymentMethod({ outletId, consumerId, tokenRef });
await client.validatePaymentMethod({ outletId, consumerId, tokenRef });
await client.deletePaymentMethod({ outletId, consumerId, tokenRef });
```

`createCardPaymentMethod` is not wired to RN UI because `CreateCardRequest` requires PAN/CVV and current NISdk does not expose them safely to JS.

`createWalletPaymentMethod` is not wired because existing Apple Pay / Google Pay APIs do not expose `CreateWalletRequest` fields in the required form.

Errors are `TokenizationApiError` `{ status, code, message, correlationId }`.

### Component (UI POC, separate from the HTTP client)

```javascript
import { NgeniusTokenization } from '@network-international/react-native-ngenius';

<NgeniusTokenization
  visible={showTokenization}
  order={order}
  branding={branding}
  paymentMethods={['CARD', 'APPLE_PAY', 'GOOGLE_PAY']}
  consentOff={false}
  language="en"
  applePayConfig={{ merchantIdentifier, countryCode, merchantName }}
  googlePayConfig={{ merchantName, gateway, gatewayMerchantId, environment }}
  onSuccess={(result) => {
    // { flow, method, status, niTokenCreated: false, paymentMethod: null }
  }}
  onError={(error) => {}}
  onCancel={() => setShowTokenization(false)}
/>
```

Native CARD success still returns `niTokenCreated: false` until `POST /card` is safely connected. The component does **not** take `outletId` / `consumerId` / `tokenizationConfig`.

`branding` uses the real paypage contract only: `buttonColour`, `buttonRolloverColour`, `paymentFontColour`, `mainHeadingColour`, `pageBackgroundColour`, `backgroundColour`, `languages[].bodyCopyFont` / heading fonts, and logo fallback (`logoUrl` → `merchantLogoUrl` → `tenantLogoUrl` → `footerImageUrl` → `faviconUrl`). Geometry (56px buttons, 8–12px radii) is a local design-system default, not a backend field.

Language fonts: the component `language` prop is matched against `languages[].language`, then `languages[0]`, then design-system defaults. Arabic uses `Arial`. Merchant font names are **best-effort**: they are passed as `fontFamily` only if present. The host app must install/register that font.

### Consent information (UI POC)

```jsx
<NgeniusTokenization order={order} consentOff={false} />
```

Consent is NI-owned PayPage EN/FR/AR text. Only strict `consentOff === true`
removes its block, links and spacing. False, omitted or invalid values retain it;
missing order selects standard text, recurring/reusable uses PayPage selectors.
Merchant text and `customizedMessage` cannot replace consent.

Backend resolves invoice config `tncUrl` → transaction `termsAndConditions`
fallback and returns the result in the FIRST tokenization-init/start response.
**The exact response/container is pending.** RN does not read `order.tncUrl`,
accept a public URL/provider, or call/authenticate with PayPage/config for terms.
An internal session-scoped context holds `resolvedTncUrl` for future mapping.
Missing/invalid URL retains consent with plain Terms; a valid HTTP(S) URL uses
`Linking.canOpenURL` / `openURL`, preserving query and fragment. Internal diagnostic
codes never become shopper technical errors. Consent off skips all URL use.

SimpleIntegration uses a clearly marked local `example.com` fixture via the
internal context. It is not exported and does not prove live backend delivery.
See [the preserved source audit and final decisions](docs/paypage-consent.md) and
[implementation/validation notes](docs/tokenization-implementation.md).

### Exact POC component props

`visible = false`, `order`, `paymentMethods`, `branding`, `language = 'en'`,
`consentOff = false`, `applePayConfig`, `googlePayConfig`, `onSuccess`, `onError`,
`onCancel`.

`paymentMethods` is an explicit array containing only requested `CARD`, `APPLE_PAY`,
`GOOGLE_PAY`; the SDK also filters by native platform/capability. Other methods are
ignored. The final omitted-prop behavior is undefined by Product. The POC retains
existing POC order-based fallback for compatibility, without declaring a new default.
The demo always passes all three explicitly. An empty explicit list enables none.

No public `tncUrl`, `orderData`, URL provider, custom consent, `keyId`, or `publicKey`
prop is introduced. Product v5 optional `publicKey` remains a follow-up: inspect
existing native encryption/key management before aligning tokenization. Crypto and
the V1 API client remain unchanged; no UI POST /card or /wallet is connected.

### Native card screen (PCI)

PAN/CVV stay in the existing native card UI. The themed tokenization container does **not** collect card numbers in React Native `TextInput`s.

- **iOS NISdk 6.1.0:** `NISdk.setSDKColors(sdkColors:)` is a public `@objc` API. Colour fields on `NISdkColors` are public Swift `UIColor` vars, not Objective-C properties. This package sets those Swift fields, then restores defaults after the card sheet.
- **Android payment-sdk 5.2.3:** no runtime merchant theme API.

### Demo

`SimpleIntegration`: **Open tokenization** plus **Default theme / Merchant branding**. Existing Pay buttons are unchanged. The demo creates a **SALE** order and does not ship JWT or API keys.

## Quick Links

* [Basic Usage](https://github.com/network-international/react-native-ngenius/wiki/Basic-Usage)
* [Samsung Pay](https://github.com/network-international/react-native-ngenius/wiki/Samsung-Pay)
* [Samsung Pay FAQ & Troubleshooting](https://github.com/network-international/react-native-ngenius/wiki/Samsung-Pay#faq--troubleshooting)
* [Apple Pay](https://github.com/network-international/react-native-ngenius/wiki/Apple-Pay)
* [Google Pay](https://github.com/network-international/react-native-ngenius/wiki/Google-Pay)
