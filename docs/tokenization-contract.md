# Tokenization POC contract

Source: Hossam’s confirmation supplied in “Implement React Native consent”, 26 October 2026. This is the agreed client schema, replacing the previous internal mock intent.

Both consent statuses contain `status`, UTC ISO `clientTimestamp`, `channel: REACT_NATIVE`, `sdk: { name: react-native-ngenius, version: actual SDK_VERSION }`, and `device: { platform: IOS|ANDROID, osVersion: string, timezoneOffsetMinutes, screenWidth?, screenHeight? }`. Screen dimensions come from React Native `Dimensions.get('screen')`, in logical units. Invalid/non-finite dimensions are omitted.

`NOT_COLLECTED` adds `merchantSelectedSkipConsent: true` and gets its timestamp when preparing the request. It omits `locale` and `tncUrl`.

`COLLECTED` uses the checkbox acceptance-event timestamp, stable for that session, plus normalized `locale: en|fr|ar` and the validated `tncUrl` shown in the consent UI when available. Uncheck, close, cancel and new session clear the timestamp. Stale events cannot restore it.

The builder/serializer allowlists fields. It never sends IP/forwarded-for/browser IP, server timestamp, browser/3DS data, device identifiers/model, app version or arbitrary merchant consent fields. Server time/IP remain backend-owned.

Wallet POST: `{ walletType, encryptedPayload, consentData }` to `/api/outlets/{outletRef}/wallets`; the encrypted string is not parsed or re-encoded.

Card POST: `{ card: { pan, expiry: yyyy-MM, cvv, cardholderName }, consentData }` to `/api/outlets/{outletRef}/cards`. The card envelope and the clear-card alternative were checked read-only in the existing API’s `AddCardRequest`, `Card` and `CardTokenResource` (remote master `0919b8e5c1fb39a7888f3fa2020c8b56a9d2fbf8`). No backend files changed. Native forms own card data and HTTPS submission. JS only supplies URL, fresh Access-Token and consent after native validation, and receives allowlisted saved-token fields. Card 3DS is outside Drop 1.

The checked backend snapshot names its internal skip boolean `skippedByMerchant`; the confirmed RN wire field is `merchantSelectedSkipConsent`. The client sends the agreed name without adding an alias or changing backend code. Confirm persistence during the next authorized live sandbox check; a deployed DTO mismatch must be fixed by its owner.

Current QA: `https://paypage-sandbox.platform.network.ae`, outlet `a6b162e9-7a75-403c-b238-6303b2df455c`, `GET /tokens?consentOff=true` via `skipConsent=true`. No live consentOff=false behavior was tested or changed.
