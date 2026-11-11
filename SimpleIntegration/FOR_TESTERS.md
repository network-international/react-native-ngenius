# React Native Tokenization POC - QA Testing Guide

Record the build SHA and artifact name. This guide covers SDK 3.2.9 for NINGG-34386 (PR #75).

Record the environment and backend deployment when testing Add Card and selected-token persistence.

The SDK opens at **Select payment method**, as a bottom sheet by default. The card list uses masked numbers and shows `MM/YY` when available. An empty list still offers **Pay by card**. Use a build matching the current PR SHA. Offline screenshots use synthetic cards and fixture responses.

1. Android: install the SHA-named APK with `adb install -r <apk>`, then open SimpleIntegration. It includes the JS bundle; Metro is not needed.
2. iOS Simulator: extract the SHA-named ZIP, run `xcrun simctl install booted <app>`, then `xcrun simctl launch booted org.reactjs.native.example.SimpleIntegration`. This app cannot be installed on a physical iPhone. A device build requires existing signing; no Team/profile/certificates were changed.
3. For live QA, create a session from the merchant backend for the sandbox outlet used by the demo and obtain a fresh short-lived TOKENIZATION_SDK Access-Token through the approved secure flow. Paste both `sessionRef` and the token into **Tokenization sandbox QA**, then tap **Open sandbox tokenization**. The demo keeps them in memory and clears them on close. The provider rejects the token after five minutes.
4. Sandbox host: `https://paypage-sandbox.platform.network.ae`. Live QA uses **skipConsent=true** and outlet `a6b162e9-7a75-403c-b238-6303b2df455c`. Opening calls `GET /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}?consentOff=true`. An empty list with no `tncUrl` is valid. If credentials expire, reopen with a fresh authorized token and a valid session reference.
5. Enable **Offline UI preview** to run without credentials or backend calls. Tap **Scenario** to cycle through saved cards, a new shopper with successful Card verification, Card verification failure, expiry at Pay, invalid Access-Token and missing outlet/session. Pay by card uses a deterministic native bridge fixture in this preview. Use sandbox QA for the actual native form and server requests.

**Presentation and branding.** Switch between **Harbour Travel** and **Citrus Market** to compare the PayPage-style `branding` palettes. Check the default bottom sheet, blur opt-in on a platform that supports it, and fullscreen. Dismiss the sheet by tapping outside or swiping down. Fullscreen has a Cancel control. Enable **Pay by card first** to test a custom section order. Enable **Show Continue Shopping** to append `CONTINUE_SHOPPING` to `paymentMethods`. Enable **Show card security note** to display the card safety line. Cycle EN, FR and AR to check localized labels and RTL.

**Card.** **Pay by card** opens the native form on both platforms. Check invalid or expired fields and Back, then use approved sandbox test data and a fresh Access-Token. Keep PAN and CVV inside the native form. A successful verification returns the updated list in the same session. The SDK confirms the new method with `PUT selected-token` and closes after acknowledgment. On failure, the chooser reappears with an actionable message and no failed card in the list.

**Token type.** The demo uses the default `PERMANENT`. Automated tests cover `modeConfig.tokenType: 'ONCE_OFF'`, the default and rejection of invalid explicit values before an Add request. Get Session carries no usage type.

**Selection and merchant result.** Choose a saved method and tap **Pay**. Rapid taps should submit only once. After acknowledged selection the SDK reports `200` with the session ID. The merchant backend uses it for payment with a Merchant Service Account. Preview shows the status and message on the host after close. Dismissal reports `499` if no terminal outcome was already reported. Check invalid credentials and missing session on opening, then simulate mid-flow expiry and verify `402` with the SDK expiry message. The host starts a new session after expiry.

**Wallets.** The Add Wallet backend endpoint is pending. The built-in client reports `ADD_WALLET_BACKEND_PENDING`. Live wallet E2E requires the deployed endpoint, a physical Android device or iPhone, approved UAT configuration, and Apple Pay merchant entitlements and signing where applicable.

**Consent.** Turn off **Skip consent in preview** to review the consent-enabled actions. Card consent applies to native submission and wallet consent to its Pay action. Opening legal links, selecting a saved method and cancelling leave consent unchanged. Missing or invalid T&C URLs leave plain text. With `skipConsent=true` the notice is hidden and Add uses `NOT_COLLECTED` with `skippedByMerchant: true`.

Optional order display: check absent details (no invented amount/summary), amount only, partial supplied items/fees and a complete summary. It starts collapsed; modeConfig.orderSummaryInitiallyExpanded=true opens it initially. Header total must prefer supplied orderSummary.total, then amount. Money value uses nonnegative integer minor units and accepts digit strings; check AED '3910' as 39.10, a currency with different precision, and invalid/incomplete money omitted. No quantity multiplication, total calculation, guessed currency or FX should occur. Explicit orderDetails must not merge missing fields from legacy order. Check language fallback: supported language prop, orderDetails.language, legacy order.language, then English; region tags resolve to EN/FR/AR.

Configuration: verify `modeConfig.labels.pageTitle` and `pageSubtitle`, optional return-button variants and localized labels. The optional security note reads “Card details are sent securely to Network International.” and requires `modeConfig.showSecurityNote=true`. Confirm the merchant payment result separately after the SDK reports successful selection.

Defects must include build SHA, device/model, OS, language, theme, steps and expected/actual behavior. Never include PAN, CVV, API key, Access-Token or wallet payload in screenshots, logs or tickets.

Developer build: copy `src/config.example.js` to ignored `src/config.js` (public defaults, credentials blank), install the demo dependencies and run `pod install` from `ios`. The legacy Android demo requires JDK 17 and a modern D8 compiler: set `NI_QA_D8_JAR` to an installed Android Build Tools `lib/d8.jar`, then run `./gradlew -Pandroid.aapt2FromMavenOverride=<installed-build-tools>/aapt2 :app:assembleRelease`. No compiler binary is committed.
