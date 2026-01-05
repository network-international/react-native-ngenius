# Quick Testing Guide - For QA Team

## TL;DR - One Command Launch

### Android (Google Pay Integration)
```bash
cd SimpleIntegration
./start-android.sh
```

That's it! The script handles everything automatically.

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
