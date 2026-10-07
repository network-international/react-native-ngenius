# Tokenization POC consolidation — 2026-09-30

## Applied decisions

NI owns consent; only literal `consentOff === true` removes the whole block and
spacing. All other values use PayPage localized copy. Standard/missing-order and
recurring/subscription/installment/reusable selectors are unchanged. Merchant
text/URL injection is not supported. `customizedMessage` is unrelated.

Backend resolves invoice config `tncUrl` → transaction `termsAndConditions`
fallback and includes the final URL in the FIRST tokenization-init/start response
when consent is on. The precise response/container is pending. RN has no consent
HTTP/config/auth transport. `order.tncUrl` is no longer consumed.

The internal context holds `resolvedTncUrl` independently of the final response.
It is associated with the current order, invalidated on close, and must be freshly
created per init. A later session cannot inherit a prior destination even when its
order object is reused. The demo mounts a local bootstrap provider per opening and
clears it on close. That fixture is local to `SimpleIntegration/src/app.js`, uses a
reserved example.com destination, and is not an exported production API.

Explicit `paymentMethods` filters to CARD / APPLE_PAY / GOOGLE_PAY plus native
capability. Omitted-prop Product semantics remain undefined: the previous POC
order-based behavior is preserved without introducing a new default. The demo
always passes an explicit list. No Samsung/APM/split-settlement tokenization.

## Exact component API

`visible = false`, `order`, `paymentMethods`, `branding`, `language = 'en'`,
`consentOff = false`, `applePayConfig`, `googlePayConfig`, `onSuccess`, `onError`,
`onCancel`.

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

Tests cover explicit method allowlist/capability; strict consent defaults/invalid
values; standard/missing-order and recurring/reusable/installment; EN/FR/AR and
RTL; clickable/missing/malformed URLs and preserved queries; guarded browser
opening; consent-off URL skip; merchant text/URL rejection; no consent transport;
and session reset including reused orders/context, plus V1 API client and
payment-export regression tests.

## Remaining production work

- Final init-response container and backend delivery/mapping for `tncUrl`.
- Native secure create-token operation; live Card/Wallet service integration and
  PaymentMethodResponse/tokenRef result. Existing native success still reports
  `niTokenCreated: false`; no UI POST /card or /wallet has been connected.
- Inspect NISdk/payment-sdk encryption and align native payload/key management
  with the existing contract. No new crypto format, keyId or publicKey BE payload.
- Confirm mobile authentication/key placement for live service calls.
- MCP / new 3DS integration.
