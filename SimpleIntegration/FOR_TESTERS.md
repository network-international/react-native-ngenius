# React Native Tokenization POC - QA Testing Guide

Use the canonical `demo/rn-tokenization` branch and record the build SHA and artifact name. This guide covers the SDK 3.2.9 Card demo. Wallet flows are deferred until after this demo.

For presenting the demo, use the Android APK or iOS Simulator ZIP in the [QA Guide's current demo builds](https://networkinternational.atlassian.net/wiki/spaces/NING/pages/5713658046#demo-builds-2026-11-26). These Release builds include the JavaScript bundle and do not need Metro. The current artifacts are built from `f8d807c`; later documentation-only commits do not change those binaries.

To update an existing source checkout before building:

```sh
git fetch origin
git switch demo/rn-tokenization
git pull --ff-only
git rev-parse --short HEAD
```

Do not merge the demo branch into `master` for the presentation. Follow the developer-build requirements below if building from source.

Record the environment and backend deployment when testing Add Card and selected-payment-data persistence.

The SDK opens at **Select payment method**, as a bottom sheet by default. The card list uses masked numbers and shows `MM/YY` when available. An empty saved-method list can still offer **Add new card** when Get Session permits card schemes. An explicit empty `paymentMethods` object or empty `paymentMethods.card` list does not permit the card form. If `paymentMethods` is omitted, the compatibility fallback offers the card form without scheme logos. Offline screenshots use synthetic cards and fixture responses.

1. Android: install the SHA-named APK with `adb install -r <apk>`, then open SimpleIntegration. It includes the JS bundle; Metro is not needed.
2. iOS Simulator: extract the SHA-named ZIP, run `xcrun simctl install booted <app>`, then `xcrun simctl launch booted org.reactjs.native.example.SimpleIntegration`. This app cannot be installed on a physical iPhone. A device build requires existing signing; no Team/profile/certificates were changed.
3. Create the session from the merchant backend, or use authorized API tooling for UAT QA. Send `POST https://api-gateway-uat.ngenius-payments.com/payment-tokenization/outlets/{outletRef}/sessions` with `Authorization: Bearer {{createSessionAccessToken}}` and `Content-Type` and `Accept` both set to `application/vnd.ni-payment-tokenization.v1+json`. The JSON body follows the Tokenization API Specification v29: `{ "advisedTokens": [], "orderDetails": { "action": "AUTH", "amount": { "currencyCode": "AED", "value": 1500 } } }`, plus an optional `orderSummary` inside `orderDetails`. The response `session_id` is the `sessionRef`. Use the Bearer credential approved for this gateway route; the specification requires role `CREATE_PAYMENT_TOKEN` with outlet access. Confirm which service account type carries it with the backend team and keep this credential outside the app.
4. On the demo **Settings** screen, turn off **Offline UI preview**. The PayPage base URL, outlet reference, SDK Access-Token and session reference fields start empty. Enter the URL for the environment being tested, the configured Anzhelika merchant’s outlet, a fresh `TOKENIZATION_SDK` Access-Token scoped to that outlet, and the returned `sessionRef`; do not paste an API key into the Access-Token field. Use the Anzhelika outlet after its payment configuration is ready. Tap **Open merchant demo** to continue to the separate **Merchant** screen, then open tokenization using its payment button. Use **‹ Settings** on Merchant to return and correct the configuration; the fields remain editable. The demo does not open the older fixed-amount direct-payment sample. The provider rejects the token after five minutes. Live QA uses **skipConsent=true**. The SDK calls `GET /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}?consentOff=true` with the SDK Access-Token. An empty list with no `tncUrl` is valid. If credentials expire, return to Settings and enter a fresh authorized token and a valid session reference.
5. Enable **Offline UI preview** to run without credentials or backend calls. Tap **Scenario** to cycle through saved cards, a new shopper with successful Card verification, Card verification failure, expiry at Pay, invalid Access-Token and missing outlet/session. Pay by card uses a deterministic native bridge fixture in this preview. Use sandbox QA for the actual native form and server requests.

**Presentation and branding.** Switch between **Harbour Travel** and **Citrus Market** to compare the PayPage-style `branding` palettes. Check the default bottom sheet, blur opt-in on a platform that supports it, and fullscreen. Dismiss the sheet by tapping outside or swiping down. Fullscreen has a Cancel control. Enable **Pay by card first** to test a custom section order. Enable **Show Continue Shopping** to pass `paymentMethods={['CONTINUE_SHOPPING']}`; the card and saved methods must stay available. The demo passes no `order` or method list, so methods and schemes come only from the session. Enable **Show card security note** to display the card safety line. Cycle EN, FR and AR to check localized labels and RTL.

**Card.** The live demo uses `modeConfig.addCardsBeforePay=true`. **Add new card** opens the native form on both platforms. Check invalid or expired fields and Back, then use approved sandbox test data and a fresh Access-Token. Keep PAN and CVV inside the native form. Tap **Add Card**; a successful verification returns the updated list in the same session. Select the intended card row and tap **Pay**. The SDK confirms that explicit choice with `PUT selected-payment-data`, shows progress, and closes after acknowledgment with no separate success screen. Adding a card alone does not start payment or confirm the selection in this demo mode. The card form shows only the scheme logos listed in Get Session `paymentMethods.card` (top level of the response); an explicit empty list hides Add new card. On failure, the chooser reappears with an actionable message and no failed card in the list. The direct-Pay native-form offline scenarios use a different mode and should not be presented as the live demo sequence.

**Token type.** The live QA screen uses `ONCE_OFF` to match the Card handover. The SDK still supports both `ONCE_OFF` and `PERMANENT`. Get Session carries no usage type.

**Selection and merchant result.** Choose a saved method and tap **Pay**. Rapid taps should submit only once. After acknowledged selection the SDK reports `200` with the session ID. The merchant backend uses it for payment with a Merchant Service Account. Preview shows the status and message on the host after close. Dismissal reports `499` if no terminal outcome was already reported. Check invalid credentials and missing session on opening, then simulate mid-flow expiry and verify `402` with the SDK expiry message. The host starts a new session after expiry.

**Wallets.** The Add Wallet backend endpoint is pending. A wallet button appears only when Get Session lists the wallet, on its platform (Apple Pay on iOS, Google Pay on Android), with device support and a client that supports Add Wallet. The built-in client does not, so wallet buttons stay hidden. Live wallet E2E requires the deployed endpoint, a physical Android device or iPhone, approved UAT configuration, and Apple Pay merchant entitlements and signing where applicable.

**Consent.** Turn off **Skip consent in preview** to review the consent-enabled actions. Card consent applies to native submission and wallet consent to its Pay action. Opening legal links, selecting a saved method and cancelling leave consent unchanged. Missing or invalid T&C URLs leave plain text. With `skipConsent=true` the notice is hidden and Add uses `NOT_COLLECTED` with `skippedByMerchant: true`.

Optional order display: check absent details (no invented amount/summary), amount only, partial supplied items/fees and a complete summary. It starts collapsed; modeConfig.orderSummaryInitiallyExpanded=true opens it initially. Header total must prefer supplied orderSummary.total, then amount. Money value uses nonnegative integer minor units and accepts digit strings; check AED '3910' as 39.10, a currency with different precision, and invalid/incomplete money omitted. No quantity multiplication, total calculation, guessed currency or FX should occur. Amount and summary come only from Get Session `orderDetails` and methods from its top-level `paymentMethods`, never from init props, and stay hidden while loading or after an error. The offline previews use the specification shape (`advisedTokens`, top-level `paymentMethods`, `orderDetails` with `action`). The **Legacy top-level Get Session fields** scenario checks the fallback for the earlier shape (`tokens`, no `orderDetails`). Check language fallback: supported language prop, orderDetails.language, legacy order.language, then English; region tags resolve to EN/FR/AR.

Configuration: verify `modeConfig.labels.pageTitle` and `pageSubtitle`, optional return-button variants and localized labels. The optional security note reads “Card details are sent securely to Network International.” and requires `modeConfig.showSecurityNote=true`. Confirm the merchant payment result separately after the SDK reports successful selection.

Defects must include build SHA, device/model, OS, language, theme, steps and expected/actual behavior. Never include PAN, CVV, API key, Access-Token or wallet payload in screenshots, logs or tickets.

Developer build: copy `src/config.example.js` to ignored `src/config.js` (public defaults, credentials blank), install the demo dependencies and run `pod install` from `ios`. The legacy Android demo requires JDK 17 and a modern D8 compiler: set `NI_QA_D8_JAR` to an installed Android Build Tools `lib/d8.jar`, then run `./gradlew -Pandroid.aapt2FromMavenOverride=<installed-build-tools>/aapt2 :app:assembleRelease`. No compiler binary is committed.


**Slow selection preview (offline mock).** Enable Offline UI preview, tap Scenario until
**Slow selection · offline mock**, then open the preview, choose a saved card and tap Pay.
The selection fixture waits two seconds: progress must remain visible and repeat Pay/dismissal
must be blocked until acknowledgement. Then the SDK closes with result 200, without a happy screen.
This scenario uses the specification-shaped session fixture and makes no UAT request. Live timing is unchanged.
