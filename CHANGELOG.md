# Changelog

All notable changes to `@network-international/react-native-ngenius` are documented in this file.

## [3.2.7] - 2026-10-19

### Upgrade notes
- Run `pod update NISdk` to pick up 6.1.4.

### Added
- `configureSDK` now applies `shouldShowOrderAmount` on iOS too (it was Android only), and
  accepts `shouldShowCancelAlert` on both platforms. Both settings already existed in the
  native SDKs.
- Colour customisation now matches across platforms: native iOS `NISdk` bumped `6.1.3` → `6.1.4`
  and Android `5.2.5` each add the colour options the other platform already had. Colours are
  set natively (Android `colors.xml`, iOS `NISdkColors`); see the customisation guide.

### Changed
- **Android: the card payment screen now looks like the iOS one** (Android SDK `5.2.5`): same
  title bar with Cancel, card preview, Number / Expires / CVV / Name rows and pay button.

### Fixed
- **Android: card number label misaligned in Arabic.** With `configureSDK({ language: "ar" })`
  the label above the card number field ("رقم بطاقة الدفع") sat at the field's left edge
  instead of its right edge. Native Android SDK bumped `5.2.4` → `5.2.5`.

## [3.2.6] - 2026-10-13

### Fixed
- **iOS: `pod install` / build fails on Xcode 27** because the native SDK declared iOS 14.0
  while Xcode 27 supports 15.0 and later. Native iOS `NISdk` bumped `6.1.2` → `6.1.3`
  (deployment target 15.0); this pod now declares iOS 15.0 too (was a stale 11.0).
- **Android: `configureSDK({ language })` was ignored**, so the SDK stayed in the app's
  language. Native Android SDK bumped `5.2.3` → `5.2.4`, which adds `SDKConfig.setLanguage`,
  and the bridge now passes `language` through. Supported: `"en"`, `"ar"`, `"fr"`.
- Android: `configureSDK` no longer throws when `shouldShowOrderAmount` is omitted.
- `SDK_VERSION` and package version aligned to `3.2.6`.

### Upgrade notes
- Apps must target iOS 15.0 or later (React Native 0.76+ already requires 15.1). Run
  `pod update NISdk` to pick up 6.1.3.
- If you raised pod deployment targets in your Podfile's `post_install` to work around the
  Xcode 27 error, you can remove that.

## [3.2.5] - 2026-10-13

### Added
- **TypeScript definitions** (`index.d.ts`). TypeScript projects no longer fail with
  `TS7016: Could not find a declaration file for module '@network-international/react-native-ngenius'`,
  and get typed configs (`ApplePayConfig`, `GooglePayConfig`, `SDKConfig`) and result shapes
  (`PaymentSuccess`, `PaymentFailure`, `GooglePaySuccess`). No runtime changes.
- `SDK_VERSION` and package version aligned to `3.2.5`.

### Upgrade notes
- Drop-in over 3.2.4. If you added `declare module '@network-international/react-native-ngenius';`
  to work around the missing types, delete it to get the real types.

## [3.2.4] - 2026-10-13

### Fixed
- **Android build fails on current React Native with `Could not find method jcenter()`.**
  JCenter was removed in Gradle 9, which current React Native releases use, so any app on
  them failed at `android/build.gradle` of this package before compiling. Replaced both
  `jcenter()` repositories with `mavenCentral()`. iOS is unchanged.
- `SDK_VERSION` and package version aligned to `3.2.4`.

### Upgrade notes
- Drop-in over 3.2.3. If you replaced `jcenter()` in `node_modules` (by hand or with
  `patch-package`) to get Android building, remove that patch.

## [3.2.3] - 2026-10-08

### Fixed
- **`npm install` fails on current React Native projects with `ERESOLVE ... peer
  react@"^16.8.1"`.** The `react` peer range only allowed React 16, so npm 7+ refused any
  project on React 17, 18 or 19 — every React Native release since 0.64. Widened to
  `>=16.8.1`. Yarn only warned, so yarn installs were unaffected. No code changes.
- `SDK_VERSION` and package version aligned to `3.2.3`.

### Upgrade notes
- Drop-in over 3.2.2. If you installed with `--legacy-peer-deps` or `--force` to get
  past the error, that is no longer needed.

## [3.2.2] - 2026-10-08

### Fixed
- **iOS build failure: `Property 'platform' not found on object of type 'NISdk *'`**
  ([#68](https://github.com/network-international/react-native-ngenius/issues/68)).
  3.2.1 sets `NISdk.platform` from the Objective-C bridge, but NISdk 6.1.1 did not
  expose that property to Objective-C, so every iOS build of 3.2.1 failed. Native iOS
  `NISdk` bumped `6.1.1` → `6.1.2`, which does.
- `SDK_VERSION` and package version aligned to `3.2.2` (3.2.1 still reported `3.2.0`).

### Upgrade notes
- Drop-in over 3.2.0 / 3.2.1. Run `pod update NISdk` to pick up 6.1.2.
- If you patched `NISdk.swift` locally (adding `@objc` to `platform`) to get 3.2.1 to
  build, that patch is no longer needed.

## [3.2.1] - 2026-09-10

### Changed
- **Native iOS `NISdk` bumped `6.1.0` → `6.1.1`**, which reports exactly one payment
  result per payment (Apple Pay, saved card, 3DS v1).
- iOS requests now carry `X-NI-Platform: IOS_REACT_NATIVE`.

### Known issues
- iOS does not compile — see 3.2.2.

## [3.2.0] - 2026-07-30

### Changed
- **Native iOS `NISdk` bumped `6.0.2` → `6.1.0`.** The iOS pin is exact, so this is what
  actually delivers the native work below to React Native integrators — 6.0.2 predated
  all of it.

### Added (via NISdk 6.1.0)
- **JAYWAN card scheme on iOS** — IINs `6690`/`9784`, early IIN-based scheme detection
  (resolves as the BIN is typed), and the JAYWAN logo asset. Brings iOS in line with the
  Android JAYWAN support shipped in 3.1.x.
- Apple Pay "smoother journey": the intermediate authenticating screen is gone; the
  `PKPaymentAuthorization` sheet is presented immediately with authorization running
  concurrently.

### Fixed (via NISdk 6.1.0)
- **False "payment failed" after a successful 3DS2 challenge.** Two independent causes:
  a benign WebKit "frame load interrupted" (error 102) was treated as fatal and raced
  ahead of the real challenge-response, and the 3DS2 payer-IP lookup could kill payments
  started via `executeThreeDSTwo()`.
- **Unknown card schemes no longer break decoding.** `CardProvider` now falls back to
  `.unknown` instead of throwing, matching `WalletProvider`. Previously a single
  unrecognised scheme value failed the whole `OrderResponse` decode — which surfaced as
  a false payment failure on the post-3DS `getOrder`. This makes the SDK tolerant of new
  schemes enabled backend-side without an app update.
- Card scheme logos never rendered — assets were loaded from the wrong bundle.

### Upgrade notes
- Same Android toolchain requirement as 3.1.1 (**RN 0.71+ / AGP 8 / Gradle 8 /
  compileSdk 35 / JDK 17**). No API changes — drop-in over 3.1.2.
- iOS integrators should run `pod update NISdk` (or `pod install`) to pick up 6.1.0.

## [3.1.2] - 2026-07-10

### Changed
- **Native `payment-sdk` bumped `5.2.2` → `5.2.3`**, which adds the JAYWAN 8-digit BIN
  detection refinement (identifies the JAYWAN scheme from the 8th digit, PR #92) on top
  of the existing JAYWAN support and the removed token logging.
- `SDK_VERSION` and package version aligned to `3.1.2`.

### Upgrade notes
- Same Android toolchain requirement as 3.1.1 (**RN 0.71+ / AGP 8 / Gradle 8 /
  compileSdk 35 / JDK 17**). No API changes — drop-in over 3.1.1.

## [3.1.1] - 2026-07-09

Fixes the broken Android build shipped in 3.1.0.

### Fixed
- **Android no longer fails to compile.** `Utils.java` passed an `int` to
  `Order.Amount.setValue`, which `payment-sdk 5.x` changed to accept a `Double`.
  Java does not auto-convert `int → Double`, so the bridge module failed to compile
  against the 5.2.x native SDK — breaking every consumer's Android build. The amount
  is now cast so it compiles.

### Changed
- **Native `payment-sdk` bumped `5.2.1` → `5.2.2`**, which removes the `NI-SDK-HTTP`
  cURL/response Logcat logging. That logging dumped `Authorization` headers (Basic API
  key + Bearer tokens) and request/response bodies to Logcat — sensitive data that must
  not be logged by a released SDK.
- `SDK_VERSION` and package version aligned to `3.1.1`.

### Upgrade notes
- **Android now requires a modern toolchain.** `3.1.x` pulls `payment-sdk 5.2.x`, which
  is built with Java 17 / Kotlin sealed classes and AndroidX (lifecycle 2.8.x). Consuming
  apps must use **AGP 8 / Gradle 8 / compileSdk 35 / JDK 17**, i.e. **React Native 0.71+**.
  Apps on RN 0.70.x cannot build this release.
- iOS is unaffected by the Android toolchain requirement (uses `NISdk 6.0.2`).

## [3.1.0] - 2026-07-06 [DEPRECATED]

> ⚠️ **Deprecated — do not use.** The Android bridge does not compile against the bumped
> native SDK (see the `Utils.java` fix in 3.1.1). Use **3.1.1** or later.

### Added
- **JAYWAN card scheme support on both platforms.** iOS via the pinned `NISdk 6.0.2`;
  Android by bumping the native `payment-sdk` `3.0.6` → `5.2.1`.
- iOS: `initiateApplePay` now guards against a nil decoded order (an unknown
  payment-method value previously caused an `EXC_BAD_ACCESS` crash in the Apple Pay flow).

### Changed
- npm tarball no longer ships `android/build` artifacts.

## [3.0.1] - 2026-03-02

Previous published release.

[3.2.3]: https://github.com/network-international/react-native-ngenius/releases/tag/3.2.3
[3.2.2]: https://github.com/network-international/react-native-ngenius/releases/tag/3.2.2
[3.2.1]: https://github.com/network-international/react-native-ngenius/releases/tag/v3.2.1
[3.2.0]: https://github.com/network-international/react-native-ngenius/releases/tag/3.2.0
[3.1.2]: https://github.com/network-international/react-native-ngenius/releases/tag/3.1.2
[3.1.1]: https://github.com/network-international/react-native-ngenius/releases/tag/3.1.1
[3.1.0]: https://github.com/network-international/react-native-ngenius/releases/tag/3.1.0
[3.0.1]: https://github.com/network-international/react-native-ngenius/releases/tag/3.0.1
