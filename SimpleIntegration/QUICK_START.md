# Quick Start Guide - N-Genius React Native SDK

This guide helps you quickly launch the SDK demo application on Android with Google Pay integration.

## Prerequisites

Before running the script, ensure you have:

### Required for Android:
- Node.js (v16 or higher)
- npm or yarn installed
- Dependencies installed: run `npm install` or `yarn install` in this directory
- Android Studio installed
- Android SDK and tools configured
- At least one Android emulator created (recommended: Pixel 5 API 35)
- Environment variable `ANDROID_HOME` set (usually `~/Library/Android/sdk` on macOS)

---

## Quick Start (One Command)

### Android with Google Pay
```bash
./start-android.sh
```

Or with a specific emulator:
```bash
./start-android.sh Pixel_5_API_35
```

---

## What the Script Does

The script automatically:

1. **Check/Start Emulator**
   - Detects if already running
   - Starts if needed and waits for boot completion

2. **Configure Environment**
   - Sets up port forwarding for Metro bundler

3. **Start Metro Bundler**
   - Checks if Metro is already running
   - Starts Metro in background if needed
   - Waits for Metro to be ready

4. **Build & Install App**
   - Builds the application
   - Installs on emulator
   - Launches the app

---

## Manual Setup (If Script Doesn't Work)

### Android Manual Steps:

1. **Start Android Emulator**
   ```bash
   # List available emulators
   emulator -list-avds
   
   # Start an emulator
   emulator -avd Pixel_5_API_35 -no-snapshot-load &
   ```

2. **Start Metro Bundler**
   ```bash
   npm start
   ```

3. **In a new terminal, run the app**
   ```bash
   # Set up port forwarding
   adb reverse tcp:8081 tcp:8081
   
   # Build and install
   npm run android
   ```

---

## Troubleshooting

### Problem: "Metro bundler not starting"
**Solution:**
```bash
# Kill any existing Metro processes
killall node
lsof -ti:8081 | xargs kill -9

# Clear cache and restart
npm start -- --reset-cache
```

### Problem: "Android emulator not found"
**Solution:**
```bash
# List available emulators
emulator -list-avds

# Create a new one in Android Studio:
# Tools → Device Manager → Create Device
```

### Problem: "Port 8081 already in use"
**Solution:**
```bash
# Find and kill the process
lsof -ti:8081 | xargs kill -9
```

### Problem: "Red error screen on app launch"
**Solution:**
- Press `R` twice on keyboard
- Or shake the device and tap "Reload"

### Problem: "Build failed" or "Dependencies error"
**Solution:**
```bash
# Clean and reinstall dependencies
rm -rf node_modules
npm install
```

### Problem: "App shows old version / cached content"
**Solution:**
```bash
# Android
cd android
./gradlew clean
cd ..

# Then restart Metro with cache reset
npm start -- --reset-cache
```

### Problem: "Google Pay button not visible"
**Solution:**
- Ensure you're running on Android (Google Pay is Android-only in this integration)
- Check that the emulator has Google Play Services installed
- Verify test credentials are configured in `src/ngenius-apis.js`

---

## Testing Google Pay Integration

The demo app includes Google Pay integration for Android. To test:

1. **Launch the app** using the script
2. **Open the payment form**
3. **Look for the Google Pay button**
4. **Test credentials** are already configured in `src/ngenius-apis.js`:
   - API Key: `MjBkZWYwZGYtYjJlYS00MzdhLWIyNjAtNjU2NDE1ODhlZDY0Ojc2ZTA0N2I2LTg5NGMtNDBmOS04NTQwLWUzYTUxNmY0MjQ2MA==`
   - Outlet ID: `7a25a4a6-d7a8-43e3-af16-e190ce2b0f10`
   - MID: `2078478434`

---

## Capturing Screenshots/Videos

### Android (using adb):
```bash
# Screenshot
adb exec-out screencap -p > screenshot.png

# Video recording (press Ctrl+C to stop)
adb shell screenrecord /sdcard/demo.mp4
adb pull /sdcard/demo.mp4
```

### Using Android Studio:
- Run → Record Video
- Run → Screenshot

---

## Advanced Configuration

### Change Target Device

Edit `start-android.sh` line 20, or pass emulator name:
```bash
./start-android.sh "Pixel_6_API_34"
```

### Environment Variables

Create a `.env` file in this directory:
```
ANDROID_HOME=/Users/yourname/Library/Android/sdk
NODE_OPTIONS=--max-old-space-size=4096
```

---

## Need Help?

If you encounter issues:

1. Check the Metro bundler logs: `/tmp/metro-android.log`
2. Check Android Studio logs for build errors
3. Ensure all prerequisites are installed
4. Try manual setup steps above

---

## Success Checklist

Before reporting issues, verify:

- Node.js is installed (`node --version`)
- Dependencies are installed (`ls node_modules`)
- Emulator is visible in Android Studio
- Metro bundler shows "Ready" or responds to `curl http://localhost:8081/status`
- No port conflicts (8081 is free)

---

**Last Updated:** January 2026
**SDK Version:** See `package.json`
