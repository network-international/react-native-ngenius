# Tokenization POC contract

The merchant backend calls `POST /api/outlets/{outletRef}/payment-tokenization-sessions` with `{ advisedTokens: [...] }` and passes the returned `sessionRef` to the merchant app. The array can be empty. The app opens the SDK with that reference. The SDK starts with `GET /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}` to load the saved-token list and `tncUrl`. The public `skipConsent` prop maps to `?consentOff=true` when enabled.

Add Card posts to `/api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}/cards` with `{ card, usageType, consentData }`. The native form handles entry, validation and HTTPS submission. The React Native boundary passes session context, action usage type and consent. Only allowlisted token list fields return to JS.

The session-based Add Wallet contract is `{ walletType, encryptedPayload, usageType, consentData }`. `walletType` is `GOOGLE_PAY` or `APPLE_PAY`, and the mapper preserves the encrypted string as received. The live backend endpoint is pending.

The optional `modeConfig.tokenType` defaults to `PERMANENT` and accepts `ONCE_OFF` for one-time use. The SDK sends the value as `usageType` on Add Card or Add Wallet. Invalid explicit values block Add with `INVALID_USAGE_TYPE`. The session requests carry no usage type. A successful Add Card, or Add Wallet once available, supplies the updated token list for the same session.

`PUT /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}/selected-token` with `{ tokenRef }` records the shopper's explicit choice. Selection must succeed before the merchant starts payment. The merchant backend submits `POST /transactions/outlets/{outletRef}/payment/pts-session/{sessionRef}` with its Merchant Service Account credential outside the React Native tokenization SDK.

## Consent data

Both statuses contain `status`, UTC ISO `clientTimestamp`, `channel: REACT_NATIVE`, `sdk: { name: react-native-ngenius, version }`, and `device: { platform, osVersion, timezoneOffsetMinutes, screenWidth?, screenHeight? }`. The SDK supplies its actual version. The platform is `IOS` or `ANDROID`. Valid screen dimensions are React Native logical screen units.

`NOT_COLLECTED` includes `skippedByMerchant: true` and a timestamp from request preparation. `COLLECTED` uses the current Add action's acceptance timestamp, normalized locale (`en`, `fr` or `ar`), and the validated `tncUrl` shown to the shopper when available. The serializer allowlists fields. Server time and IP remain backend-owned.
