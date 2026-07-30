# Changelog

All notable changes to `@network-international/react-native-ngenius` are documented in this file.

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

[3.1.2]: https://github.com/network-international/react-native-ngenius/releases/tag/3.1.2
[3.1.1]: https://github.com/network-international/react-native-ngenius/releases/tag/3.1.1
[3.1.0]: https://github.com/network-international/react-native-ngenius/releases/tag/3.1.0
[3.0.1]: https://github.com/network-international/react-native-ngenius/releases/tag/3.0.1
