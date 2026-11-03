# React Native Tokenization POC – QA Testing Guide

Use the SHA and artifact names in the accompanying BUILD_INFO.txt. Branch: NINGG-34386 (PR #75). SDK 3.2.9.

1. Android: install the SHA-named APK with `adb install -r <apk>`, then open SimpleIntegration. It includes the JS bundle; Metro is not needed.
2. iOS Simulator: extract the SHA-named ZIP, run `xcrun simctl install booted <app>`, then `xcrun simctl launch booted org.reactjs.native.example.SimpleIntegration`. This app cannot be installed on a physical iPhone. A device build requires existing signing; no Team/profile/certificates were changed.
3. Open **Tokenization sandbox QA**. Obtain a fresh short-lived TOKENIZATION_SDK Access-Token through the approved secure flow, paste it into the password input and tap **Open sandbox tokenization**. Do not put an API key in the app. The token stays in memory, clears on close, and the provider rejects it after five minutes. Paste a fresh token for every new session.
4. Live QA always uses **skipConsent=true** and outlet `a6b162e9-7a75-403c-b238-6303b2df455c`. Saved Tokens calls `/tokens?consentOff=true`. HTTP 200 with an empty list and no tncUrl is valid. No consent block should appear. Use Retry for load errors; 401/403 requires a fresh authorized token.
5. For UI checks without credentials, enable **UI preview (no network)**. Check default/merchant theme, EN/FR/AR, Arabic RTL, skip-consent ON/OFF, checkbox gating, and close/reopen reset. Preview responses are fixtures and do not prove sandbox E2E.

Current acceptance scope: Saved Tokens, token-provider wiring and UI. Card saving is unavailable in this build. Apple Pay encrypted native capture and Google Pay raw-token plumbing exist, but live UI wallet capture/submission is blocked until the agreed consentData JSON is supplied. No native Card or wallet E2E success is claimed. The low-level wallet client can preserve a supplied consentData body; the app does not invent one.

Future wallet checks require a physical Android/iPhone, approved UAT wallet configuration and, for Apple Pay, merchant entitlements/signing. Public UAT config can be entered as JSON with `googlePay` / `applePay` objects using the SDK config fields. Never include API keys in that config. Verify availability, open/cancel, a single submission, VERIFIED refresh, AWAIT_3DS pending and FAILED error after consent wiring is enabled. A simulator cannot establish real Apple Pay E2E.

Backend-dependent: final consentOff=false deployment and tncUrl behavior. Do not test live consentOff=false in this build. Card 3DS is outside Drop 1.

Defects must include build SHA, device/model, OS, language, theme, steps and expected/actual behavior. Never include PAN, CVV, API key, Access-Token or wallet payload in screenshots, logs or tickets.

Developer build: copy `src/config.example.js` to ignored `src/config.js` (public defaults, credentials blank), install the demo dependencies and run `pod install` from `ios`. The legacy Android demo requires JDK 17 and a modern D8 compiler: set `NI_QA_D8_JAR` to an installed Android Build Tools `lib/d8.jar`, then run `./gradlew :app:assembleRelease`. No compiler binary is committed.
