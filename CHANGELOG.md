# Changelog

All notable changes to `@network-international/react-native-ngenius` are documented in this file.

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
