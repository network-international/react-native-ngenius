# Quick Testing Guide - For QA Team

## Prerequisites

**Before running the script, make sure you have:**

1. **Node.js and npm** (or yarn)
   - Check if installed: `node --version` and `npm --version`
   - If not installed:
     - **macOS:** `brew install node`
     - **Or download:** https://nodejs.org/ (LTS version recommended)
     - **Or use nvm:** `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash`
   - After installing, restart your terminal

2. **Android Studio** with Android SDK
   - Download: https://developer.android.com/studio
   - Make sure Android SDK is installed

3. **Android Emulator** created in Android Studio
   - Open Android Studio → Tools → Device Manager
   - Create a new virtual device (recommended: Pixel 5, API 35)

---

## TL;DR - One Command Launch

### Android (Google Pay Integration)
```bash
cd SimpleIntegration
./start-android.sh
```

That's it! The script handles everything automatically.

**Note:** The script will automatically check if npm/yarn is installed and show an error message with installation instructions if not found.

---

## What to Expect

1. **Script starts** (takes 2-3 minutes total)
2. **Emulator launches** (if not running)
3. **Metro bundler starts** (development server)
4. **App builds and installs**
5. **App opens automatically**

---

## Test Scenarios

### Basic Functionality
1. App launches without crashes
2. Payment form is visible
3. Can enter card details

### Google Pay Integration (Primary Test)
1. Google Pay button appears
2. Can initiate Google Pay flow
3. Payment processes successfully

### Card Payment
1. Can enter card number
2. Validation works
3. Payment submission works

---

## Pre-configured Test Data

The app is already configured with valid test credentials:
- **API Key:** Already set
- **Outlet ID:** Already set
- **Environment:** TEST

You don't need to configure anything.

---

## Capturing Test Evidence

### Screenshots

**Android:**
```bash
adb exec-out screencap -p > screenshot.png
```

### Screen Recording

**Android:**
```bash
adb shell screenrecord /sdcard/test-video.mp4
# Press Ctrl+C when done
adb pull /sdcard/test-video.mp4
```

---

## Common Issues & Quick Fixes

### "npm or yarn is not installed"
**This means Node.js is not installed on your system.**

**Solution:**
1. **Install Node.js:**
   - **macOS:** `brew install node`
   - **Or download:** https://nodejs.org/ (LTS version)
   - **Or use nvm:** `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash`
2. **Restart your terminal**
3. **Verify installation:** `node --version` and `npm --version`
4. **Run the script again:** `./start-android.sh`

### "react-native: command not found"
**This means dependencies are not installed.**

**Solution:**
```bash
cd SimpleIntegration
npm install
```

Then run the script again:
```bash
./start-android.sh
```

**Note:** The script now automatically checks and installs dependencies, but if you see this error, run `npm install` manually first.

### "Script permission denied"
```bash
chmod +x start-android.sh
```

### "Metro bundler not starting"
```bash
killall node
lsof -ti:8081 | xargs kill -9
```

### "Emulator not found"
Create emulator in Android Studio (Tools → Device Manager)

### Red error screen in app
Press `R` twice on keyboard

### "Build failed"
```bash
# Clean and reinstall
rm -rf node_modules
npm install
```

---

## Expected Test Results

### Success Criteria
- App launches without errors
- Google Pay button is visible
- Can interact with payment form
- No crashes during normal use
- Metro bundler shows "Ready"

### Test Report Template

```
Test Date: _______
Platform: Android
Device/Emulator: _______

Launch Time: _____ seconds
Crashes: [ ] Yes [ ] No
Google Pay Visible: [ ] Yes [ ] No
Payment Form Works: [ ] Yes [ ] No

Notes:
_______________________________
```

---

## Emergency Contacts

If scripts don't work after trying quick fixes:
1. Check full documentation: `QUICK_START.md`
2. Verify prerequisites (Node.js, Android Studio)
3. Check logs: `/tmp/metro-android.log`

---

## Video Tutorial (Recommended Workflow)

1. **Start recording** before running script
2. **Run script:** `./start-android.sh`
3. **Show app launch**
4. **Demonstrate Google Pay** button
5. **Test payment form**
6. **Stop recording**
7. **Save video** as test evidence

---

**Estimated Testing Time:** 15-20 minutes  
**Total Setup Time:** 3-5 minutes  
**Last Updated:** January 2026
