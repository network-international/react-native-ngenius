# Tokenization UI refinement, 6 November 2026

Status: frontend POC changes for PR #75, based on NINGG-34386 at 6c9db81. Final backend session integration and live E2E remain pending. No backend implementation, payment orchestration or release version change. Historical screenshots use explicit offline fixtures.

## Shopper experience

- Loaded empty list: no Saved payment methods heading and no empty-list message. Show Add payment method, available wallet options, Card, and NI consent/T&C when consent is required.
- Existing methods: masked scheme/last4, expiry, wallet source when applicable, one radio selection identified internally by tokenRef. AWAIT_3DS/FAILED records cannot be selected. Selection is not payment authorization.
- The first usable method is selected on entry. The shopper can choose another; refresh preserves a still-valid explicit choice. Use this payment method submits the selected UUID privately to NI session storage. Only HTTP 200 shows the success animation, followed by local closing and onSelectionComplete({flow: TOKENIZATION, status: SELECTED, canClose: true}). The completion never exposes the selected token/card and does not represent payment or new-token creation. Errors remain open for retry or another selection.
- The selected row remains selected when native Card returns through Back. A new launch selects the first usable method. Refresh removes a selection that is no longer in the authoritative current list.
- 6 November refinement: a blue radio identifies the shopper's local choice without a visible Selected label. A separate green check with the Verified label reflects a token's backend-reported VERIFIED status, independently of whether that row is selected. It does not assert merchant-origin import, fresh validation for the current session, payment authorization, or successful payment. Screen readers retain the radio checked state and announce the separate verification status. Only the separate selectedToken HTTP 200 confirmation starts the acknowledgement and closing animation.
- Add another card uses the existing native form. A visible leading Back uses the existing Aborted/cancel cleanup on iOS and Android. It returns to method selection without submitting a new card. PAN/CVV stay native.
- Saved-list loading uses an animated skeleton. Submission/verification uses three animated dots. Native Card shows a spinner after valid input while waiting. Reduced-motion preferences stop decorative pulses.
- Loading, loaded empty, and load failure are distinct states. Initial loading cannot flash an empty-list message. A load error offers Retry.
- Consent remains an unchecked explicit checkbox for adding a new method. T&C is a separate accessible link using the response tncUrl. Opening it does not accept consent. skipConsent=true removes the entire consent block. Selecting an already saved method does not request fresh storage consent.
- Before consent, wallet options are neutral blocked rows. When enabled, official PKPaymentButton/Google Pay PayButton render. Existing platform/readiness filtering and wallet SDK capture calls remain authoritative.
- Merchant colors/fonts/logo, EN/FR/AR, RTL, secure native card capture, and existing payment SDK exports remain available.

## Design basis

Real Visa, Mastercard, Amex, Diners, Discover, JCB, UnionPay and generic-card vector artworks are adapted from modern PayPage SVG components using react-native-svg. Wallet rows show the wallet brand and an explicit Wallet badge; the funding card is secondary.

Modern PayPage SavedCardsSelection is the internal visual reference: 64 px rows, 8 px radius, 12 px gap, 46 by 30 scheme badge, #DADADA border, #F5F9FC selected background, #0069B1 radio state. The existing PayPage button palette and merchant overrides are retained.

External primary references support separating selection, addition and confirmation; they do not establish comparative conversion performance:

- [Stripe Mobile Payment Element](https://docs.stripe.com/payments/mobile/embedded): saved-method selection and recognizable masked identity.
- [Stripe setup flow](https://docs.stripe.com/payments/mobile/accept-payment-embedded?platform=react-native&type=setup): selection/details sheet, loading/error handling, cancellation separate from payment success.
- [Adyen tokenization](https://docs.adyen.com/standard/integration/drop-in/tokenization): stored-method reuse and explicit consent for storing new details.
- [Apple Pay interface guidance](https://developer.apple.com/design/human-interface-guidelines/apple-pay) and [Google Pay Android brand guidelines](https://developers.google.com/pay/api/android/guides/brand-guidelines): official wallet buttons for actual wallet entry.

## Scope and pending contract

The user-provided getSession sketches (advicedToken, selectedToken, allowedPaymentMethods, mcpEnabled, mcpCurrencies) are product/backend discussion input. This UI change does not add those wire fields or invent session behavior. The current client still uses Access-Token directly.

The updated supplied diagram and transcript require selected-token storage inside NI, followed by a status-only handoff to the merchant app without charging. Merchant payment/session orchestration, accepted production consent terms, live populated-token responses, token lifecycle eligibility beyond current VERIFIED semantics, and real wallet E2E remain separate contract/QA work. The supplied draft PUT route is enabled only with enableDraftSessionSelection: true; the endpoint/body/error/idempotency contract is not final.

## Review artifacts

See [RN Implementation Notes](https://networkinternational.atlassian.net/wiki/spaces/NING/pages/5451218947) for screenshots and historical build context, and [the QA Testing Guide](https://networkinternational.atlassian.net/wiki/spaces/NING/pages/5615386697) for the current frontend/backend test scope. Native Card screenshots contain blank fields and no request payloads. The demo terms page is an explicitly labeled navigation fixture, not merchant legal wording.

Hossam's 6 November update says to use Add Card for DEV and UAT for now and wait for the new deployed version. This is environment guidance, not a successful live Add Card retest or a final session contract. Record the actual deployed version when retesting.

## Documentation preference

Use commas, colons, parentheses, or a short hyphen. Do not use the long dash character (U+2014).

## Supported modeConfig

All fields are optional. Missing or invalid values use NI localized defaults. Only the listed UI labels are supported; NI consent text and wallet artwork remain controlled by the SDK.

```js
modeConfig: {
  returnButtonName: 'BACK',
  returnButtonStyle: 'button', // text | link | button; default button
  labels: {
    pageTitle: 'Choose a payment method',
    usePaymentMethod: 'Continue',
    addCard: 'Add Card',
    addAnotherCard: 'Add another card'
  }
}
```

Other supported labels: savedMethodsTitle, addMethodTitle, selectionPending, selectionSuccessTitle, selectionSuccessMessage, selectionError. Labels are plain text. The return control is visible at the root and emits cancellation, not a successful selection.

## Draft session selection adapter

```text
PUT /api/outlets/{outletRef}/sessions/{sessionRef}/selectedToken
{ "selectedToken": "<UUID>" }
```

The client requires explicit enableDraftSessionSelection: true and the component requires sessionRef. No create/get/validate-session API is invented. Submit shows progress; HTTP 200 shows a brief selected check and closes; all other statuses leave the chooser open. A successful empty response body is valid. No token/card data is forwarded through onSelectionComplete.

Wallet capture receives a copied zero-value order context; legacy payment functions keep the merchant order amount. New method creation may require backend verification independently of selecting an existing method.

MCP/currency conversion and later merchant payment/3DS steps in the supplied target diagram remain separate pending integrations. This patch does not add FX APIs or change payment orchestration.
