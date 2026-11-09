# Tokenization POC contract

Each SDK journey creates one session with `POST /api/outlets/{outletRef}/payment-tokenization-sessions` and `{ advisedTokens: [...] }`. The array contains any returning shopper token references and can be empty. The response must provide `sessionRef`. `GET /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}` replaces standalone List Tokens and returns the saved-token list. The public `skipConsent` prop maps to `?consentOff=true` when enabled.

Add Card posts to `/api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}/cards` with `{ card, usageType, consentData }`. The native form handles entry, validation and HTTPS submission. The React Native boundary passes session context, action usage type and consent. Only allowlisted token list fields return to JS.

The session-based Add Wallet contract is `{ walletType, encryptedPayload, usageType, consentData }`. `walletType` is `GOOGLE_PAY` or `APPLE_PAY`, and the mapper preserves the encrypted string as received. The live backend endpoint is pending.

`UsageType.ONCE_OFF` and `UsageType.PERMANENT` are the allowed values. Each Card or Wallet creation action supplies its own `usageType`. Invalid or missing values block the action with `INVALID_USAGE_TYPE`. Create Session and Get Session carry no `usageType`. A successful Add Card, or Add Wallet once available, supplies the updated token list directly for the UI to use within the same session.

`PUT /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}/selected-token` with `{ tokenRef }` records the shopper's explicit choice. Selection must succeed before the merchant starts payment. The merchant backend submits `POST /transactions/outlets/{outletRef}/payment/pts-session/{sessionRef}` with its Merchant Service Account credential outside the React Native tokenization SDK.

## Consent data

Both statuses contain `status`, UTC ISO `clientTimestamp`, `channel: REACT_NATIVE`, `sdk: { name: react-native-ngenius, version }`, and `device: { platform, osVersion, timezoneOffsetMinutes, screenWidth?, screenHeight? }`. The SDK supplies its actual version. The platform is `IOS` or `ANDROID`. Valid screen dimensions are React Native logical screen units.

`NOT_COLLECTED` includes `skippedByMerchant: true` and a timestamp from request preparation. `COLLECTED` uses the current Add action's acceptance timestamp, normalized locale (`en`, `fr` or `ar`), and the validated `tncUrl` shown to the shopper when available. The serializer allowlists fields. Server time and IP remain backend-owned.
