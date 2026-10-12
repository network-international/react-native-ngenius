# Tokenization POC consolidation

## Backend contract alignment

Contracts: `add-card-api.json`, `add-wallet-api.json`, `saved-tokens-api.json`
(received 9 Oct 2026). The earlier V1 consumer `/payment-methods` client was
replaced; consumerId, `X-API-Key`, Bearer, the V1 media type, idempotency and
correlation headers, UUID-only references and the DAN/cryptogram mapping are gone.

| Endpoint | RN status |
| --- | --- |
| `GET /api/outlets/{outletRef}/tokens` (`tokens` repeated, `consentOff`) | `getSavedTokens`; used by the component for `tncUrl` |
| `POST /api/outlets/{outletRef}/wallets` | `addWallet`; wired for Google Pay |
| `POST /api/outlets/{outletRef}/cards` | Path modelled only; native dependency |
| `POST .../tokens/{tokenRef}/orders/{orderReference}/payments/{paymentReference}/3ds2/authentications` | `authenticateThreeDS` |
| `POST .../3ds2/challenge-response` | `submitThreeDSChallengeResponse` |

Headers are `Access-Token` and `Content-Type: application/json`; `X-Forwarded-For`
is set by the gateway. `getAccessToken` is called per request; the token comes
from the merchant backend (identity access-token endpoint) and is never stored,
refreshed or logged. Base URLs are pending, so `baseUrl` is required and no
environment default ships.

Verification: a `tokenRef` can exist before verification. Only `VERIFIED` is
success. `AWAIT_3DS` carries `orderReference`, `paymentReference` and `3ds2`
(method step: `threeDSServerTransID`, `threeDSMethodData`,
`threeDSMethodNotificationURL`, optional `threeDSMethodURL`; challenge step:
`acsURL`, `base64EncodedCReq`, `acsTransID`, `transStatus`). The parser exposes
it as `threeDS2.step` `METHOD` or `CHALLENGE`. UI states are `READY`,
`SUBMITTING`, `VERIFYING`, `AWAITING_3DS`, `SUCCESS` and `FAILED`.

Card: native secure capture must send `{ card: { pan, expiry, cvv,
cardholderName }, merchantAttributes? }` over TLS to `/cards`. PAN/CVV never
cross the bridge; there is no JS card create or card mapper. JWE is not
implemented. Vendor NISdk / payment-sdk sources are unchanged.

Google Pay: the Android bridge returns `tokenizationData.token`; it is sent
unchanged as `encryptedPayload`. Merchant `googlePayConfig` must use the N-Genius
gateway values. Implemented and unit-tested with mocks only; not run on an
Android device.

Apple Pay: blocked. The iOS bridge returns status only, not the EC_v1 payment
token required by `/wallets`.

3DS: the client calls are implemented. The native runner is pending and must
follow the PayPage/BFF redirect pattern: load `threeDSMethodURL` with
`threeDSMethodData`, read `threeDSCompInd` from the method-notification redirect,
call `authentications`, open `acsURL` with `base64EncodedCReq`, read
`base64EncodedCRes` from the challenge redirect, then call `challenge-response`
(repeat if `AWAIT_3DS` is returned again). The existing order-scoped native 3DS
is not reusable as-is. Until the runner exists, `AWAIT_3DS` ends in a controlled
pending state with code `THREE_DS_CONTINUATION_UNAVAILABLE`.

`force3DS` (`merchantAttributes`) is not defaulted, not exposed as a prop and
never sent for wallets.

## Visual consolidation (2026-09-30)

## Applied decisions

NI owns consent; only literal `consentOff === true` removes the whole block and
spacing. All other values use PayPage localized copy. Standard/missing-order and
recurring/subscription/installment/reusable selectors are unchanged. Merchant
text/URL injection is not supported. `customizedMessage` is unrelated.

Backend resolves invoice config `tncUrl` → transaction `termsAndConditions`
fallback and returns it from the saved-tokens endpoint when consent is on. RN has
no PayPage/config transport. `order.tncUrl` is not consumed.

The component loads `tncUrl` per open and clears it on close, so a later session
cannot inherit a prior destination. The demo uses a demo-only in-memory client in
`SimpleIntegration/src/app.js` with a reserved example.com destination.

Explicit `paymentMethods` filters to CARD / APPLE_PAY / GOOGLE_PAY plus native
capability. Omitted-prop Product semantics remain undefined: the previous POC
order-based behavior is preserved without introducing a new default. The demo
always passes an explicit list. No Samsung/APM/split-settlement tokenization.

## Exact component API

`visible = false`, `order`, `paymentMethods`, `branding`, `language = 'en'`,
`consentOff = false`, `tokenizationClient`, `outletRef`, `applePayConfig`,
`googlePayConfig`, `onSuccess`, `onError`, `onCancel`.

There is no public terms URL, URL provider, `orderData`, custom consent, `publicKey`
or `keyId` prop. Product v5 optional publicKey is documented, not implemented with
an unverified crypto contract.

## PayPage visual audit

Fetched `paypage-app-2 origin/master`: `1d37b89bc43762e2cca1a0279ae57d04ca45b3ac`.
Read the current WalletSection, CardForm, TnC, PaymentOptions, PaymentLayout mobile
footer, Apple wallet styles, Logo, Typography and Alert source/styles.

| Area | POC comparison |
| --- | --- |
| Spacing | Existing 20pt side inset approximates PayPage mobile 4.9vw; native safe areas replace browser viewport padding. |
| Wallet | Black full-width wallet button, 8pt radius; capability-driven Apple Pay observed. RN uses a text/glyph mark, not PayPage SVG artwork. |
| Divider | Centered 14pt text and 24pt vertical margin follow WalletSection. |
| Card | 16pt heading / 32pt line height, 56pt action; Add Card opens NISdk secure capture instead of embedding web fields. |
| Consent | Below wallet group/before divider and below card action. 13pt/16pt copy; OFF removes it and its own padding. |
| Terms | Underline and inherited consent color, full long copy wrapping without clipping. |
| Continue Shopping | Centered 14pt label (PayPage exportButton size); RN full-screen layout keeps it near the bottom. Web export icon and payment footer are not duplicated. |
| Typography | Native system font or installed merchant font (demo Georgia); web Gotham/Benton font assets are not bundled. Existing white-label text colors remain. |
| Header/logo | Existing logo fallback and 96×40 mobile limit retained; runtime branded screenshot uses the existing Northwind text header, not a remote logo. |
| Loading/error | Existing RN pending dots and inline error/retry remain; not pixel-identical to PayPage's skeleton/Alert. Terms diagnostics never enter shopper error UI. |

No native card-field redesign or speculative backend screens were added. This is a
source-to-simulator comparison, not a live browser pixel-diff against a PayPage order.

## Build and runtime evidence

Backend contract alignment: iOS simulator Debug build of SimpleIntegration
(iPhone 17) `BUILD SUCCEEDED`; release JS bundles built for iOS and Android.
No runtime re-validation on simulator or device was done for this change.

Visual consolidation (2026-09-30):

Device: iPhone 17 simulator, iOS 26.5.
React Native 0.70.3 and NISdk 6.1.0 were not upgraded.

Build command from SimpleIntegration:

```sh
xcodebuild -workspace ios/SimpleIntegration.xcworkspace -scheme SimpleIntegration -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' build
```

`BUILD SUCCEEDED`. Existing dependency warnings remain. Metro on port 8081 used
SimpleIntegration's local SDK resolver. App and tokenization rendered with no
Invalid Hook Call/red overlay.

| Validation | Result |
| --- | --- |
| Build / install / launch | PASS |
| Metro connection / local SDK / no Invalid Hook Call | PASS |
| Default consent ON / OFF | PASS |
| Merchant consent ON / OFF | PASS |
| Recurring and reusable long consent | PASS |
| Missing-order standard fallback | PASS |
| Apple Pay shown when supported | PASS |
| Add Card → native NISdk card screen | PASS |
| Native cancel → tokenization restored | PASS |
| Tokenization close/reopen | PASS |
| Existing normal payment opens | PASS; no payment submitted |
| Demo Terms clickable appearance | PASS |
| Actual simulator browser handoff from inline Terms | NOT VERIFIED; nested link coordinate automation failed. Unit handler/capability/query tests pass. |
| Live backend delivery / live token creation | PENDING production integration, not represented by demo screenshots |

The existing normal payment demo shows its existing generic failure alert on
native Cancel. It was dismissed; screenshots contain no such alert.

Consent-on states use the LOCAL demo T&C fixture. UI validation is complete for
those visual states; live backend `tncUrl` delivery is still pending.

## Manual check

On the default consent-on tokenization screen, tap the underlined **Terms and
Conditions** below Apple Pay or below Add Card. Expected: Safari opens
`https://example.com/?demo=tokenization&locale=en#terms`. This is a
link-interaction fixture, not real merchant terms. Continue Shopping closes the
modal.

For other states: Continue Shopping → toggle Merchant branding / Consent off →
Open tokenization. The Consent scenario button cycles Standard → Recurring →
Reusable → Missing order → Standard.

## Tests and preserved boundaries

Run with `npm test -- --runInBand --watchman=false`.

Tests cover Access-Token handling (just-in-time provider, unavailable token, no
Bearer/API key headers); saved tokens (repeated query, zero tokens, consentOff);
`SavedCardResponse` parsing for VERIFIED / AWAIT_3DS / FAILED and both 3DS steps;
wallet requests and errors; 3DS request bodies and reference validation; the
backend error body; the Google Pay slice (VERIFIED, AWAIT_3DS, FAILED, abort,
missing token, no logging); verification states; T&C loading per open; plus the
existing method allowlist, consent copy, URL safety, session and payment-export
regression tests. All backend calls use mock transports.

## Remaining production work

- Backend correction of `saved-tokens-api.json` (`tncUrl` with `consentOff=true`,
  `tokens` marked required).
- Confirmed base URLs.
- Native secure `POST /cards`; the Card flow still reports `niTokenCreated: false`.
- Apple Pay token from the iOS bridge.
- Native 3DS runner.
- Google Pay validation on an Android device with N-Genius gateway config.
- JWE for cards (out of scope). MCP.
