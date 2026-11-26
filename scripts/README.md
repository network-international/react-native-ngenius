# Start the tokenization demo

The launcher installs the verified **26 November 2026 / f5faf9a** demo builds,
including the Add Card fallback for an empty `paymentMethods: {}` configuration.
They contain the JavaScript bundle, so Node, npm, CocoaPods, Gradle and Metro are
not needed to run them. Download the build files yourself through the authenticated
[QA Guide](https://networkinternational.atlassian.net/wiki/spaces/NING/pages/5713658046#demo-builds-2026-11-26).

## First run on a Mac

1. Install Python 3. For Android, install Android Studio, its Platform Tools and an
   Android virtual device. For iOS, install Xcode and an iPhone Simulator runtime.
   The supplied iOS build requires an **Apple Silicon Mac** and iOS Simulator 15+.
2. Update the source checkout using `git fetch origin`, `git switch demo/rn-tokenization`
   and `git pull --ff-only`.
3. Download the Android APK and iOS Simulator ZIP from the guide into Downloads.
   Keep their original filenames; the ZIP can remain zipped.
4. From the repository root, run:

   ```sh
   bash scripts/launch-demo.sh both --artifacts "$HOME/Downloads" --tools
   ```

The script checks both downloads against the published SHA256 values, uses an
already running emulator/Simulator or starts one, installs the apps and opens
them. If there is more than one possible device, it asks you to choose. `--tools`
also opens Postman on macOS and the QA Guide in your browser. Open the Portal
using the guide's environment-specific link.

For just one platform:

```sh
bash scripts/launch-demo.sh android --artifacts "$HOME/Downloads" --tools
bash scripts/launch-demo.sh ios --artifacts "$HOME/Downloads" --tools
```

Android also supports a Linux host with Python 3 and the Android SDK. The iOS ZIP
cannot run on Windows, Linux, an Intel Mac or a physical iPhone.

## Choose a device or check setup

```sh
# Check files and tools without starting or installing apps.
bash scripts/launch-demo.sh both --artifacts "$HOME/Downloads" --check

# Select an AVD, a running Android emulator, or an iPhone Simulator explicitly.
bash scripts/launch-demo.sh android --avd YOUR_AVD_NAME
bash scripts/launch-demo.sh android --android-serial emulator-5554
bash scripts/launch-demo.sh ios --ios-udid YOUR_SIMULATOR_UDID

# Renamed downloads can be supplied by path; their hashes must still match.
bash scripts/launch-demo.sh android --android-apk "/path with spaces/demo.apk"
```

Use `--help` for all options. Boot waits are bounded; `--timeout 300` allows a slow
first Simulator boot. The launcher never uninstalls the app, clears application
data, changes Git branches, kills Metro or installs development dependencies.
Physical Android devices are not selected. Starting an app opens a fresh demo
session; connection fields remain empty.

## Rehearse and run UAT

Use **Offline UI preview** to rehearse both merchant themes without backend calls.
For live UAT, enter the authorised environment URL, outlet, fresh SDK Access-Token
and session reference in Settings. Keys and tokens are not read or supplied by the
launcher.

In Postman, use collection **NI Tokenization - UAT Demo** and environment
**NI Tokenization - Anzhelika UAT**. Run requests individually:
**0A → 1 → 0B → 2 → SDK card flow → 5 → 6 → 7**. The SDK performs Add Card and
selection, so do not repeat Postman 3/4 after doing those steps in the app.
The launcher does not create sessions, add cards or make payments. The full live
flow still requires a configured outlet. An empty `paymentMethods: {}` response
keeps Add Card available without scheme logos; an explicit `card: []` disables it.

When publishing a newer application build, update `demo-builds.json` only after
verifying its artifacts and checksums. Pulling source alone does not rebuild or
replace the pinned APK/ZIP.
