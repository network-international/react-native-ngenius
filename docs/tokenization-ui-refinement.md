# Tokenization UI refinement, 6 November 2026

Status: frontend POC changes for NINGG-34386, PR #75. Use the current PR SHA and matching build context for review. No backend implementation, payment orchestration or release version change. Offline previews and simulated selected-token responses are demo/mock evidence.

## Shopper experience

- A compact white panel uses the hosted Museum preview as its visual reference, with a green shield, NI footer, merchant theme overrides and optional title/subtitle. No successful-list “loaded” message remains on screen.
- An empty list hides the saved-method heading and shows supported Add Card/Wallet actions. Loading uses an animated skeleton; a load failure offers Retry. Initial loading cannot flash the empty state.
- Card and wallet rows lead with the same scheme and masked funding number. Expiry occupies its own `Expires MM/YY` line, with a zero-padded month. A separate `Card`, `Wallet / Apple Pay` or `Wallet / Google Pay` tag identifies the source. Seven NI PayPage scheme artworks plus a generic fallback are used; MC and CUP aliases map to Mastercard and UnionPay.
- The first usable method is selected on entry. The Add response and native Card Back preserve a still-valid shopper choice. A choice absent from the returned list is cleared. AWAIT_3DS/FAILED records cannot be selected.
- A blue radio indicates local selection. A separate green Verified badge reflects backend-reported VERIFIED status. It does not establish fresh session validation, merchant-origin import or payment authorization. Screen readers announce radio state and verification separately.
- Add another card opens the existing native form. Back uses existing Aborted/cancel cleanup and returns without submitting. PAN/CVV stay native. Native entry, legacy payment functions and wallet capture capabilities are unchanged by this visual refinement.
- Submission uses animated dots. Reduced-motion preferences stop decorative pulses. Official platform wallet buttons still use the existing supported-method and device-readiness filtering.

## Click-to-agree consent

The user-approved flow replaces the checkbox with a notice beside Add Card/Wallet: continuing agrees to the displayed Terms and Conditions, and Privacy Policy when a valid link is supplied. Each actionable Add click records a fresh UTC acceptance timestamp for that attempt and prepares `COLLECTED` consent data. A retry is a new Add attempt. No acceptance is created by selecting an existing method, cancelling, opening a legal link or expanding Saving terms.

`skipConsent=true` maps to `?consentOff=true` on Get Session, hides the notice and sends `NOT_COLLECTED` with `skippedByMerchant: true`. The response `tncUrl` is linked only when valid; otherwise the notice remains plain text. NI recurring-storage wording is retained behind an accessible Saving terms expand/collapse control. Neither the NI legal wording nor wallet artwork is merchant-editable through labels.

Live collected-consent validation remains pending.

## Optional amount and order summary

`orderDetails` accepts optional `language`, `amount` and `orderSummary`. The summary accepts `items` (description, quantity, category, totalPrice), shipping, tax and total. It is initially collapsed; `modeConfig.orderSummaryInitiallyExpanded: true` opens details initially. The header uses the supplied summary total, then amount. Without usable supplied data, it is absent. An amount alone does not create an expandable empty summary.

Each money field uses `{ currencyCode, value }`. `value` is a nonnegative integer in minor units, as a safe integer number or digit string. AED `'3910'` means AED 39.10; JPY `'3910'` means JPY 3,910. Currency precision follows a recognized ISO currency. If `value` is absent, `formattedValue` may contain a canonical major-unit decimal string such as `'39.10'`, without grouping or currency text. A supplied `value` takes precedence. Invalid or incomplete money is omitted. Large integer strings retain their precision.

The SDK does not invent missing amounts, currencies, quantities, fees or totals, multiply quantities, calculate totals or perform FX. Explicit `orderDetails` replaces rather than merges legacy `order` display context; omitting it uses `order`. Language falls back through supported component `language`, `orderDetails.language`, legacy `order.language`, then English. EN/FR/AR and region-tag inputs are supported. These display values do not initiate payment. The wallet capture flow uses a copy of the order context with a zero amount.

## Supported modeConfig

All fields are optional. Missing or invalid values use localized NI defaults, except that subtitle and Privacy Policy link remain absent when not supplied.

```js
modeConfig: {
  returnButtonName: 'BACK',
  returnButtonStyle: 'button', // text | link | button; default button
  showSecurityNote: true,
  orderSummaryInitiallyExpanded: false,
  privacyPolicyUrl: 'https://merchant.example/privacy',
  labels: {
    pageTitle: 'Complete your booking',
    pageSubtitle: 'Choose your preferred way to pay',
    usePaymentMethod: 'Continue',
    addCard: 'Add Card',
    addAnotherCard: 'Add another card'
  }
}
```

Other supported labels: savedMethodsTitle, addMethodTitle, selectionPending, selectionSuccessTitle, selectionSuccessMessage, selectionError, orderSummary, orderItems, orderAmount, orderShipping, orderTax and orderTotal. Labels are plain text, at most 200 characters, without control characters. The return control emits cancellation, not successful selection.

`privacyPolicyUrl` must be a valid HTTP(S) web URL; no placeholder link is generated. The security note defaults to “Card details are sent securely to Network International.” Set `showSecurityNote: false` to hide it. The green shield and NI footer do not imply payment success. No application-level end-to-end encryption claim is made.

## Session selection

The chooser creates a session when opened and records the shopper's confirmed choice within that session. After successful selection and the confirmation animation, it closes and passes `sessionRef` to `onSelectionComplete`. See the [current tokenization contract](tokenization-contract.md).

## Review evidence

[RN Implementation Notes](https://networkinternational.atlassian.net/wiki/spaces/NING/pages/5451218947) contains screenshots and per-build context; [QA Testing Guide](https://networkinternational.atlassian.net/wiki/spaces/NING/pages/5615386697) separates frontend checks from backend validation. Native Card screenshots use blank fields. Demo terms navigation and wallet/token responses are labeled fixtures, without secrets or payment payloads.

Internal references are the hosted Museum preview for the compact shell and modern PayPage for NI card artwork. Official [Apple Pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay) and [Google Pay](https://developers.google.com/pay/api/android/guides/brand-guidelines) guidance govern actual platform wallet buttons. These references do not establish comparative conversion performance.

Use short hyphens, commas, colons or parentheses in new documentation. Do not use U+2014.
