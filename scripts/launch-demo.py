#!/usr/bin/env python3
"""Install and open the pinned demo builds. No credentials, API calls or builds."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import webbrowser
import zipfile


class LaunchError(Exception):
    pass


def run(command, timeout=30):
    try:
        result = subprocess.run([str(x) for x in command], capture_output=True,
                                text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise LaunchError("Could not run {}: {}".format(command[0], error)) from error
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()[:1500]
        raise LaunchError("{} failed: {}".format(command[0], detail))
    return result.stdout.strip()


def find_tool(name, sdk=None):
    candidates = ([sdk / "platform-tools" / name, sdk / "emulator" / name]
                  if sdk else [])
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    found = shutil.which(name)
    if not found:
        raise LaunchError("{} is missing. Install it through Android Studio SDK Manager.".format(name))
    return found


def artifact(directory, override, spec):
    if override:
        path = Path(override).expanduser().resolve()
    else:
        path = next((directory / name for name in spec["filenames"]
                     if (directory / name).is_file()), None)
    if path is None or not path.is_file():
        raise LaunchError("Build file not found. Download {} from the QA Guide, "
                          "or pass --android-apk / --ios-zip.".format(spec["filenames"][0]))
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != spec["sha256"]:
        raise LaunchError("SHA256 mismatch for {}. Download the matching build from the QA Guide. "
                          "Nothing has been installed.".format(path.name))
    print("Verified: {}".format(path.name))
    return path


def inspect_ios_zip(path, spec):
    with zipfile.ZipFile(path) as archive:
        roots = set()
        for info in archive.infolist():
            name = PurePosixPath(info.filename)
            if (name.is_absolute() or ".." in name.parts or "\\" in info.filename
                    or stat.S_ISLNK(info.external_attr >> 16)):
                raise LaunchError("Unsupported or unsafe path in the iOS ZIP.")
            if name.parts and name.parts[0] != "__MACOSX":
                roots.add(name.parts[0])
        if len(roots) != 1 or not next(iter(roots)).endswith(".app"):
            raise LaunchError("The iOS ZIP must contain one Simulator .app bundle.")
        root = next(iter(roots))
        info = plistlib.loads(archive.read(root + "/Info.plist"))
        if (info.get("CFBundleIdentifier") != spec["bundleId"]
                or "iPhoneSimulator" not in info.get("CFBundleSupportedPlatforms", [])):
            raise LaunchError("The ZIP does not contain the expected iOS Simulator app.")
        return root


def extract_ios(path, destination, root):
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            if PurePosixPath(info.filename).parts[0] != root:
                continue
            target = Path(archive.extract(info, destination))
            mode = (info.external_attr >> 16) & 0o777
            target.chmod(0o755 if target.is_dir() or mode & 0o111 else 0o644)
    return destination / root


def preflight(args, manifest):
    plans = {}
    directory = Path(args.artifacts).expanduser().resolve()
    if args.target in ("android", "both"):
        apk = artifact(directory, args.android_apk, manifest["android"])
        sdk_value = os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
        sdk = Path(sdk_value).expanduser() if sdk_value else (
            Path.home() / "Library/Android/sdk" if sys.platform == "darwin"
            else Path.home() / "Android/Sdk")
        adb = find_tool("adb", sdk)
        run([adb, "version"])
        plans["android"] = {"apk": apk, "adb": adb, "sdk": sdk}
    if args.target in ("ios", "both"):
        if sys.platform != "darwin":
            raise LaunchError("iOS Simulator requires macOS with Xcode. Use target 'android' on this computer.")
        arm_mac = platform.machine() == "arm64" or run(["sysctl", "-n", "hw.optional.arm64"]) == "1"
        if not arm_mac:
            raise LaunchError("This iOS ZIP requires an Apple Silicon Mac. An Intel Simulator build is not supplied.")
        archive = artifact(directory, args.ios_zip, manifest["ios"])
        xcrun = shutil.which("xcrun")
        if not xcrun:
            raise LaunchError("Xcode is required for the iOS Simulator.")
        run([xcrun, "--find", "simctl"])
        root = inspect_ios_zip(archive, manifest["ios"])
        plans["ios"] = {"zip": archive, "xcrun": xcrun, "root": root}
    return plans


def choose(items, label, flag):
    if not items:
        raise LaunchError("No {} found. Create/download one in Android Studio or Xcode.".format(label))
    if len(items) == 1:
        return items[0]
    options = "\n".join("  {}. {}".format(i + 1, item) for i, item in enumerate(items))
    if not sys.stdin.isatty():
        raise LaunchError("Multiple {} found. Select one using {}:\n{}".format(label, flag, options))
    print("Select {}:\n{}".format(label, options))
    try:
        index = int(input("Number: ")) - 1
        if index < 0:
            raise ValueError()
        return items[index]
    except (ValueError, IndexError, EOFError) as error:
        raise LaunchError("Invalid selection. Run again with {}.".format(flag)) from error


def android_devices(adb):
    return [line.split()[:2] for line in run([adb, "devices"]).splitlines()[1:]
            if len(line.split()) >= 2 and line.split()[0].startswith("emulator-")]


def select_android(args, plan):
    devices = android_devices(plan["adb"])
    online = [serial for serial, status in devices if status == "device"]
    if args.android_serial:
        if args.android_serial not in online:
            raise LaunchError("--android-serial must name a running, authorised Android emulator.")
        plan["serial"] = args.android_serial
        return
    if args.avd:
        matches = [serial for serial in online if
                   run([plan["adb"], "-s", serial, "emu", "avd", "name"]).splitlines()[0] == args.avd]
        if matches:
            plan["serial"] = choose(matches, "running emulators", "--android-serial")
            return
    elif online:
        plan["serial"] = choose(online, "running emulators", "--android-serial")
        return
    if any(status != "device" for _, status in devices):
        raise LaunchError("An emulator is offline. Wait for it to boot or resolve it in Android Studio, then retry.")
    emulator = find_tool("emulator", plan["sdk"])
    avds = run([emulator, "-list-avds"]).splitlines()
    avd = args.avd or choose(avds, "Android virtual devices", "--avd")
    if avd not in avds:
        raise LaunchError("Unknown AVD '{}'. Available: {}".format(avd, ", ".join(avds)))
    plan.update(emulator=emulator, avd=avd)


def select_ios(args, plan, spec):
    data = json.loads(run([plan["xcrun"], "simctl", "list", "devices", "available", "--json"]))
    candidates = []
    minimum = tuple(int(x) for x in spec["minimumOS"].split("."))
    for runtime, devices in data["devices"].items():
        version = re.search(r"\.iOS-(\d+)-(\d+)", runtime)
        if not version or tuple(map(int, version.groups())) < minimum:
            continue
        for device in devices:
            if device.get("isAvailable", True) and "iPhone" in device.get("deviceTypeIdentifier", device["name"]):
                candidates.append(device)
    if args.ios_udid:
        candidates = [device for device in candidates if device["udid"] == args.ios_udid]
        if not candidates:
            raise LaunchError("--ios-udid must name an available iPhone Simulator with iOS {}+.".format(spec["minimumOS"]))
    else:
        booted = [device for device in candidates if device["state"] == "Booted"]
        candidates = booted or candidates
    labels = ["{} ({})".format(device["udid"], device["name"]) for device in candidates]
    selected = choose(labels, "iPhone Simulators", "--ios-udid")
    plan["device"] = candidates[labels.index(selected)]


def launch_android(plan, spec, timeout):
    adb = plan["adb"]
    process = None
    if "serial" not in plan:
        print("Starting Android AVD: {}".format(plan["avd"]))
        process = subprocess.Popen([plan["emulator"], "-avd", plan["avd"]],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   start_new_session=True)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process and process.poll() not in (None, 0):
            raise LaunchError("The Android emulator exited. Start the AVD in Android Studio to inspect the error.")
        if "serial" not in plan:
            matches = [serial for serial, status in android_devices(adb) if status == "device"
                       and run([adb, "-s", serial, "emu", "avd", "name"]).splitlines()[0] == plan["avd"]]
            if len(matches) == 1:
                plan["serial"] = matches[0]
        if "serial" in plan:
            try:
                booted = run([adb, "-s", plan["serial"], "shell", "getprop", "sys.boot_completed"], timeout=10)
            except LaunchError:
                booted = ""  # adb can see the device before its shell is ready.
            if booted == "1":
                break
        time.sleep(2)
    else:
        raise LaunchError("Android did not boot within {} seconds. Check Android Studio, then retry.".format(timeout))
    print("Installing Android demo on {}".format(plan["serial"]))
    result = run([adb, "-s", plan["serial"], "install", "-r", plan["apk"]], timeout=120)
    if "Success" not in result:
        raise LaunchError("Android installation did not report Success: " + result)
    result = run([adb, "-s", plan["serial"], "shell", "am", "start", "-W", "-n", spec["activity"]], timeout=60)
    if re.search(r"\bError\b|\bException\b", result) or "Status: ok" not in result:
        raise LaunchError("Android could not open the demo: " + result)
    print("Android demo launched.")


def launch_ios(plan, spec, app, timeout):
    xcrun, device = plan["xcrun"], plan["device"]
    udid = device["udid"]
    print("Opening iPhone Simulator: {} ({})".format(device["name"], udid))
    if device["state"] != "Booted":
        run([xcrun, "simctl", "boot", udid])
    run([xcrun, "simctl", "bootstatus", udid, "-b"], timeout=timeout)
    developer = Path(run(["xcode-select", "-p"]))
    simulator = developer / "Applications/Simulator.app"
    if simulator.is_dir():
        run(["open", "-a", simulator, "--args", "-CurrentDeviceUDID", udid])
    else:
        run(["open", "-b", "com.apple.dt.Devices"])
        print("If Device Hub shows another device, select {}.".format(device["name"]))
    run([xcrun, "simctl", "install", udid, app], timeout=120)
    result = run([xcrun, "simctl", "launch", "--terminate-running-process", udid, spec["bundleId"]], timeout=60)
    if spec["bundleId"] + ":" not in result:
        raise LaunchError("iOS did not report a launched app process: " + result)
    print("iOS demo launched.")


def open_tools(guide):
    if sys.platform == "darwin":
        try:
            run(["open", "-a", "Postman"])
        except LaunchError:
            print("Postman could not be opened. Install/open it manually to use the QA collection.")
    webbrowser.open(guide)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", nargs="?", choices=("android", "ios", "both"), default="both")
    parser.add_argument("--artifacts", default=str(Path.home() / "Downloads"), help="Directory containing the two QA Guide downloads")
    parser.add_argument("--android-apk", help="Explicit APK path; SHA256 must match the manifest")
    parser.add_argument("--ios-zip", help="Explicit iOS ZIP path; SHA256 must match the manifest")
    android_selector = parser.add_mutually_exclusive_group()
    android_selector.add_argument("--avd", help="Android Studio virtual device name")
    android_selector.add_argument("--android-serial", help="Running emulator serial, e.g. emulator-5554")
    parser.add_argument("--ios-udid", help="iPhone Simulator UDID")
    parser.add_argument("--timeout", type=int, default=180, help="Boot timeout per platform, seconds")
    parser.add_argument("--check", action="store_true", help="Check build files and tools without starting or installing apps")
    parser.add_argument("--tools", action="store_true", help="Also open Postman (macOS) and the QA Guide")
    args = parser.parse_args(argv)
    try:
        if args.timeout < 1:
            raise LaunchError("--timeout must be positive.")
        manifest = json.loads(Path(__file__).with_name("demo-builds.json").read_text())
        print("Demo application build: {} ({})".format(manifest["commit"][:7], manifest["date"]))
        plans = preflight(args, manifest)
        if args.check:
            print("Build files and required tools are ready. No app/device changes made.")
            return 0
        # Resolve both targets before starting or installing either app.
        if "android" in plans:
            select_android(args, plans["android"])
        if "ios" in plans:
            select_ios(args, plans["ios"], manifest["ios"])
        with tempfile.TemporaryDirectory(prefix="rn-tokenization-demo-") as temporary:
            app = extract_ios(plans["ios"]["zip"], Path(temporary), plans["ios"]["root"]) if "ios" in plans else None
            if "android" in plans:
                launch_android(plans["android"], manifest["android"], args.timeout)
            if "ios" in plans:
                launch_ios(plans["ios"], manifest["ios"], app, args.timeout)
        if args.tools:
            open_tools(manifest["guide"])
        print("\nOpen Offline UI preview to rehearse, or enter fresh authorised UAT settings.")
        print("Postman: NI Tokenization - UAT Demo / NI Tokenization - Anzhelika UAT.")
        print("UAT: 0A -> 1 -> 0B -> 2 -> SDK -> 5 -> 6 -> 7. No API requests are run by this script.")
        print("Guide: " + manifest["guide"])
        return 0
    except (LaunchError, ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        print("\nDemo launch stopped: {}".format(error), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nStopped. No application data was cleared.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
