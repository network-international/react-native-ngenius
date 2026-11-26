"""Launcher safety boundaries, with temporary artifacts and fake platform tools.

No emulator, simulator, application, network request or real SDK tool is started.
"""

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import stat
import subprocess
import tempfile
import unittest
from unittest import mock
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / "launch-demo.py"
SPEC = importlib.util.spec_from_file_location("demo_launcher_under_test", SCRIPT)
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


class DemoLauncherTests(unittest.TestCase):
    def setUp(self):
        self.resources = contextlib.ExitStack()
        self.addCleanup(self.resources.close)
        self.directory = Path(self.resources.enter_context(
            tempfile.TemporaryDirectory(prefix="demo launcher tests ")))
        self.apk = self.directory / "Android demo.apk"
        self.apk.write_bytes(b"trusted demo fixture")
        self.archive = self.directory / "iOS Simulator demo.zip"
        self.bundle_id = "org.example.TokenizationDemo"
        self.write_ios_zip()
        self.manifest = {
            "commit": "0123456789abcdef", "date": "2026-11-26",
            "guide": "https://example.test/qa-guide",
            "android": {
                "filenames": [self.apk.name],
                "sha256": self.sha(self.apk),
                "activity": "com.simpleintegration/.MainActivity",
            },
            "ios": {
                "filenames": [self.archive.name],
                "sha256": self.sha(self.archive),
                "bundleId": self.bundle_id,
                "minimumOS": "15.0",
            },
        }
        self.write_manifest()
        self.commands = []
        self.devices = "List of devices attached\nemulator-5678\tdevice\n"
        self.install_failure = False
        self.launch_output = "Starting: Intent { cmp=com.simpleintegration/.MainActivity }\nStatus: ok"
        self.stdout, self.stderr = io.StringIO(), io.StringIO()
        self.resources.enter_context(contextlib.redirect_stdout(self.stdout))
        self.resources.enter_context(contextlib.redirect_stderr(self.stderr))
        self.resources.enter_context(mock.patch.object(
            launcher, "__file__", str(self.directory / "launch-demo.py")))
        self.resources.enter_context(mock.patch.object(launcher.sys, "platform", "darwin"))
        self.resources.enter_context(mock.patch.object(launcher.platform, "machine", return_value="arm64"))
        self.resources.enter_context(mock.patch.object(launcher, "find_tool", side_effect=lambda name, sdk=None: name))
        self.resources.enter_context(mock.patch.object(launcher.shutil, "which", side_effect=lambda name: name))
        self.resources.enter_context(mock.patch.object(launcher.sys.stdin, "isatty", return_value=False))
        self.fake_run = self.resources.enter_context(mock.patch.object(
            launcher.subprocess, "run", side_effect=self.platform_command))
        self.fake_popen = self.resources.enter_context(mock.patch.object(launcher.subprocess, "Popen"))
        self.fake_browser = self.resources.enter_context(mock.patch.object(launcher.webbrowser, "open"))

    @staticmethod
    def sha(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def write_manifest(self):
        (self.directory / "demo-builds.json").write_text(json.dumps(self.manifest))

    def write_ios_zip(self, extra=None):
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("Demo.app/Info.plist", plistlib.dumps({
                "CFBundleIdentifier": self.bundle_id,
                "CFBundleSupportedPlatforms": ["iPhoneSimulator"],
                "CFBundleExecutable": "Demo",
            }))
            binary = zipfile.ZipInfo("Demo.app/Demo")
            binary.external_attr = (stat.S_IFREG | 0o755) << 16
            archive.writestr(binary, b"simulator executable fixture")
            if extra:
                archive.writestr(extra, "unexpected")

    def platform_command(self, command, **kwargs):
        """Only documented fake commands are accepted; unexpected calls fail tests."""
        self.commands.append(command)
        self.assertIsInstance(command, list)
        program = Path(command[0]).name
        args = command[1:]
        result, code = "", 0
        if program == "adb":
            if args == ["version"]:
                result = "Android Debug Bridge fixture"
            elif args == ["devices"]:
                result = self.devices
            elif args[2:] == ["shell", "getprop", "sys.boot_completed"]:
                result = "1"
            elif args[2:4] == ["install", "-r"]:
                result = "Failure [INSTALL_FAILED_TEST_FIXTURE]" if self.install_failure else "Success"
                code = 1 if self.install_failure else 0
            elif args[2:5] == ["shell", "am", "start"]:
                result = self.launch_output
            else:
                self.fail("Unexpected adb command: {!r}".format(command))
        elif program == "xcrun":
            if args == ["--find", "simctl"]:
                result = "/fake/tools/simctl"
            elif args == ["simctl", "list", "devices", "available", "--json"]:
                result = json.dumps({"devices": {"com.apple.CoreSimulator.SimRuntime.iOS-26-5": [{
                    "udid": "TEST-SIMULATOR-UDID", "name": "iPhone Test",
                    "state": "Booted", "isAvailable": True,
                    "deviceTypeIdentifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-Test",
                }]}})
            elif args[:2] == ["simctl", "bootstatus"]:
                result = "Booted"
            elif args[:2] == ["simctl", "install"]:
                result = ""
            elif args[:2] == ["simctl", "launch"]:
                result = self.bundle_id + ": 12345"
            else:
                self.fail("Unexpected xcrun command: {!r}".format(command))
        elif program == "xcode-select" and args == ["-p"]:
            result = str(self.directory / "Xcode Developer")
        elif program == "open":
            result = ""
        else:
            self.fail("Unexpected platform command: {!r}".format(command))
        return subprocess.CompletedProcess(command, code, stdout=result, stderr="")

    def invoke(self, target="android", *extra):
        return launcher.main([target, "--artifacts", str(self.directory), *extra])

    def app_commands(self):
        return [command for command in self.commands if
                (Path(command[0]).name == "adb" and "install" in command)
                or (Path(command[0]).name == "adb" and "am" in command)
                or (Path(command[0]).name == "xcrun" and any(
                    value in command for value in ("boot", "install", "launch")))
                or Path(command[0]).name == "open"]

    def test_changed_apk_is_rejected_before_any_sdk_command(self):
        self.apk.write_bytes(b"different artifact")
        self.assertEqual(self.invoke(), 1)
        self.assertIn("SHA256 mismatch", self.stderr.getvalue())
        self.assertEqual(self.commands, [])
        self.fake_popen.assert_not_called()

    def test_unsafe_ios_zip_stops_both_before_any_app_changes(self):
        self.write_ios_zip("../outside.txt")
        self.manifest["ios"]["sha256"] = self.sha(self.archive)
        self.write_manifest()
        self.assertEqual(self.invoke("both"), 1)
        self.assertIn("unsafe path", self.stderr.getvalue())
        self.assertEqual(self.app_commands(), [])
        self.fake_popen.assert_not_called()

    def test_wrong_ios_hash_stops_both_before_android_install(self):
        self.manifest["ios"]["sha256"] = "0" * 64
        self.write_manifest()
        self.assertEqual(self.invoke("both"), 1)
        self.assertIn("SHA256 mismatch", self.stderr.getvalue())
        self.assertEqual(self.app_commands(), [])
        self.fake_popen.assert_not_called()

    def test_ambiguous_emulators_require_selection_without_installing(self):
        self.devices += "emulator-5680\tdevice\n"
        self.assertEqual(self.invoke(), 1)
        self.assertIn("--android-serial", self.stderr.getvalue())
        self.assertEqual(self.app_commands(), [])
        self.fake_popen.assert_not_called()

    def test_existing_emulator_launches_without_booting_another(self):
        self.assertEqual(self.invoke(), 0)
        self.fake_popen.assert_not_called()
        self.assertTrue(any(command[1:5] == ["-s", "emulator-5678", "install", "-r"]
                            for command in self.commands))
        self.assertTrue(any("am" in command and "start" in command for command in self.commands))

    def test_physical_device_is_not_selected_when_emulator_is_present(self):
        self.devices += "physical-test-phone\tdevice\n"
        self.assertEqual(self.invoke(), 0)
        installs = [command for command in self.commands if "install" in command]
        self.assertEqual(len(installs), 1)
        self.assertEqual(installs[0][2], "emulator-5678")

    def test_install_failure_does_not_attempt_to_launch_android(self):
        self.install_failure = True
        self.assertEqual(self.invoke(), 1)
        self.assertFalse(any("am" in command for command in self.commands))

    def test_am_start_error_with_exit_zero_is_failure(self):
        self.launch_output = "Error type 3\nError: Activity class does not exist."
        self.assertEqual(self.invoke(), 1)
        self.assertIn("could not open the demo", self.stderr.getvalue())

    def test_artifact_path_with_spaces_is_one_process_argument(self):
        self.assertEqual(self.invoke(), 0)
        install = next(command for command in self.commands if "install" in command)
        self.assertEqual(install[-1], str(self.apk.resolve()))
        self.assertIn(" ", install[-1])

    def test_both_existing_devices_launch_only_expected_apps(self):
        self.assertEqual(self.invoke("both"), 0)
        self.fake_popen.assert_not_called()
        self.assertFalse(any(command[1:3] == ["simctl", "boot"] for command in self.commands))
        self.assertTrue(any("--terminate-running-process" in command
                            and command[-1] == self.bundle_id for command in self.commands))
        self.fake_browser.assert_not_called()

    def test_check_does_not_start_install_or_open_any_app(self):
        self.assertEqual(self.invoke("both", "--check"), 0)
        self.assertEqual(self.app_commands(), [])
        self.fake_popen.assert_not_called()
        self.fake_browser.assert_not_called()

    def test_help_requires_no_platform_tools_or_artifacts(self):
        with self.assertRaises(SystemExit) as result:
            launcher.main(["--help"])
        self.assertEqual(result.exception.code, 0)
        self.assertEqual(self.commands, [])
        self.fake_popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
