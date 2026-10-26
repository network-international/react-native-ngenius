# React Native N-Genius SDK

React Native bindings for N-Genius card and wallet payments, with a tokenization POC for the add-card and wallet UI.

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
const { tokens } = await tokenizationClient.getSavedTokens({ outletRef });

<NgeniusTokenization
  visible={showTokenization}
  order={order}
  paymentMethods={['CARD', 'APPLE_PAY', 'GOOGLE_PAY']}
  tokenizationClient={tokenizationClient}
  outletRef={outletRef}
  branding={branding}
  language="en"
  skipConsent={false}
  applePayConfig={{ merchantIdentifier, countryCode, merchantName }}
  googlePayConfig={{ merchantName, gateway, gatewayMerchantId, environment }}
  onSuccess={handleResult}
  onError={handleError}
  onCancel={() => setShowTokenization(false)}
/>
```

`order` is the N-Genius create-order response. Pass an explicit `paymentMethods` list; wallets also require native device support. `branding` accepts PayPage branding fields. Custom fonts must be registered by the host app.

With a client and `outletRef`, opening calls `getSavedTokens` in both consent modes and loads `tncUrl`. With `skipConsent={false}` (default), the unchecked checkbox must be accepted before Card or wallets can start. `skipConsent={true}` hides the entire consent block and enables actions immediately. Acceptance resets on close/reopen. Missing or invalid URLs leave the consent text visible without a link.

## Supported methods

- Payments: `initiateCardPayment(order)`, `initiateSamsungPay(order, merchantName, serviceId)`, `initiateApplePay(order, applePayConfig)`, `initiateGooglePay(order, googlePayConfig)`.
- Helpers: `isSamsungPaySupported(serviceId)`, `isApplePaySupported()`, `isGooglePaySupported(googlePayConfig)`, `configureSDK(config)`, `executeThreeDSTwo(paymentResponse)`.
- Tokenization UI: `CARD`, `APPLE_PAY` (iOS), `GOOGLE_PAY` (Android).
- Tokenization client: `getSavedTokens({ outletRef })`, `addWallet({ outletRef, walletType, encryptedPayload })`. `authenticateThreeDS` and `submitThreeDSChallengeResponse` are experimental.

## Authentication

Supply a tokenization `baseUrl` and `getAccessToken`. Your backend obtains the short-lived identity token; the SDK requests it for each call and sends it in `Access-Token`. It does not store, refresh or log the token. Keep API keys and Basic credentials on your backend. An unavailable token fails with `ACCESS_TOKEN_UNAVAILABLE` before sending a request.

## POC limitations

- Real Card token creation is not connected. PAN/CVV stay in native capture; there is no JS card-create method. Apple Pay tokenization needs native work. Both flows return `niTokenCreated: false`.
- Google Pay sends the unchanged wallet token to `addWallet` when a client and `outletRef` are supplied. Only `VERIFIED` means success. `AWAIT_3DS` reports `THREE_DS_CONTINUATION_UNAVAILABLE`; native 3DS continuation is pending.
- Saved Tokens returns `{ tokens, page?, tncUrl? }`; `page` contains `number`, `size`, `totalElements`, `totalPages`. No token filters or pagination query parameters are sent.
- Consent state and mock serialization are implemented internally. Live consent persistence is blocked pending Hossam’s exact schema; no consent fields are sent to `/wallets` yet. Server time is preferred; no client audit timestamp or device data is collected.
- Native `/cards` integration must accept safe consent metadata once confirmed. The existing PAYMENT Card flow receives no consent data.
- iOS native Card colours follow branding and reset after closing. Android native Card uses vendor defaults; Android E2E is not verified.
- The demo mocks the tokenization backend and creates no tokens. Card JWE and MCP are outside this POC.

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
