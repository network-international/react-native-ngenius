# Tokenization POC contract

The merchant backend calls `POST https://api-gateway-uat.ngenius-payments.com/payment-tokenization/outlets/{outletRef}/sessions` with `Authorization: Bearer <token>` and `application/vnd.ni-payment-tokenization.v1+json` as both `Content-Type` and `Accept`. The request body is `{ advisedTokens: [...], orderDetails: { action, amount, orderSummary } }`, as in the Tokenization API Specification v28. The array can be empty, and `orderDetails` is optional; when sent, it requires `action` (`AUTH`, `SALE` or `PURCHASE`) and `amount` in integer minor units. The allowed payment methods come from the backend and outlet configuration, not from this request. The merchant backend passes the returned `session_id` to the merchant app as `sessionRef` and keeps the gateway bearer on the server.

The app opens the SDK with that reference and the SDK access token. The SDK starts with `GET /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}` on PayPage to load `advisedTokens`, `tncUrl`, the top-level `paymentMethods` and `orderDetails` (`amount`, `orderSummary`). The parsed list is exposed as `tokens`. A response without `advisedTokens` reads the earlier `tokens` field, and a response without `orderDetails` reads the earlier top-level amount and summary. The public `skipConsent` prop maps to `?consentOff=true` when enabled.

Add Card posts to `/api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}/cards` with `{ card, usageType, consentData }`. The native form handles entry, validation and HTTPS submission. The React Native boundary passes session context, action usage type and consent. The response `advisedTokens` (or the earlier `tokens`) is parsed natively, and only allowlisted token fields return to JS as `tokens`.

The session-based Add Wallet contract is `{ walletType, encryptedPayload, usageType, consentData }`. `walletType` is `GOOGLE_PAY` or `APPLE_PAY`, and the mapper preserves the encrypted string as received. The live backend endpoint is pending.

When a capable wallet adapter is supplied, native capture uses zero in the currency from the same Get Session snapshot. Initialization `order` or `orderDetails` cannot override that currency. Missing or invalid session currency prevents capture. Tokenization uses an internal Google Pay capture wrapper that accepts zero, while the existing payment API keeps its payment-amount validation. This preparation does not enable the built-in Add Wallet endpoint or establish live wallet support.

The optional `modeConfig.tokenType` defaults to `PERMANENT` and accepts `ONCE_OFF` for one-time use. The SDK sends the value as `usageType` on Add Card or Add Wallet. Invalid explicit values block Add with `INVALID_USAGE_TYPE`. The session requests carry no usage type. A successful Add Card, or Add Wallet once available, supplies the updated token list for the same session.

`PUT /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}/selected-token` with `{ tokenRef }` records the shopper's explicit choice. For a Card Pay action, the SDK selects the single new eligible token identified by the Add response and waits for acknowledgement before closing. An ambiguous response returns to the chooser for an explicit choice. Selection must succeed before the merchant starts payment. The merchant backend submits `POST /transactions/outlets/{outletRef}/payment/pts-session/{sessionRef}` with `{ currency, payerIp }` and its Merchant Service Account credential outside the React Native tokenization SDK. A 3DS case returns `AWAIT_3DS` with `_links.payment.href`, which the merchant app opens after the SDK has closed; the SDK never opens 3DS.

## Request failures and timeouts

Initialization failures close the SDK and return an error to the merchant. They do not show a retry screen or an order amount. Unavailable new methods and failed tokens are omitted; tokens still awaiting verification remain visible but disabled.

The built-in JS client applies one internal 30-second deadline to credentials, transport and response reading. Abort is best effort; late responses cannot change the result or trigger a late request after credential timeout. Native Card credential preparation is also bounded, separately from native HTTP connect/read limits. The wallet adapter request is bounded after native capture; the shopper's interaction with the native wallet is not timed as an HTTP request.

Timeouts, including HTTP 408/504, become `REQUEST_TIMEOUT`. The merchant result is `408`, without a session reference when initialization never succeeded. After initialization the SDK displays a localized timeout message and disables further actions. It does not automatically retry Add/Select or infer failure/success from a lost response. The merchant should inspect the session before restarting checkout. A later close cannot overwrite this terminal result with `499`.

## Consent data

Both statuses contain `status`, UTC ISO `clientTimestamp`, `channel: REACT_NATIVE`, `sdk: { name: react-native-ngenius, version }`, and `device: { platform, osVersion, timezoneOffsetMinutes, screenWidth?, screenHeight? }`. The SDK supplies its actual version. The platform is `IOS` or `ANDROID`. Valid screen dimensions are React Native logical screen units.

`NOT_COLLECTED` includes `skippedByMerchant: true` and a timestamp from request preparation. `COLLECTED` uses the native Card Pay or wallet action's acceptance timestamp, normalized locale (`en`, `fr` or `ar`), and the validated `tncUrl` shown to the shopper when available. The serializer allowlists fields. Server time and IP remain backend-owned.
