# Quick Cheatsheet - Copy & Paste Commands

## For Testers (Main Command)

### Android (Google Pay)
```bash
cd SimpleIntegration && ./start-android.sh
```

---

## Capture Evidence

### Screenshot - Android
```bash
adb exec-out screencap -p > screenshot.png
```

### Video - Android
```bash
adb shell screenrecord /sdcard/demo.mp4
# Press Ctrl+C to stop
adb pull /sdcard/demo.mp4
```

---

## Quick Fixes

### Kill Metro
```bash
killall node
lsof -ti:8081 | xargs kill -9
```

### Restart Metro
```bash
npm start -- --reset-cache
```

### Clean Build - Android
```bash
cd android && ./gradlew clean && cd ..
```

### Reinstall Dependencies
```bash
rm -rf node_modules && npm install
```

---

## Check Status

### Is Metro Running?
```bash
curl http://localhost:8081/status
```

### Is Android Emulator Running?
```bash
adb devices
```

---

## Device Management

### List Android Emulators
```bash
emulator -list-avds
```

### Start Android Emulator
```bash
emulator -avd Pixel_5_API_35 &
```

---

## Troubleshooting

### Port 8081 Already in Use
```bash
lsof -ti:8081 | xargs kill -9
```

### Red Error Screen
Press `R` twice on keyboard

### Can't Find Emulator
```bash
export ANDROID_HOME=~/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

---

## Documentation Files

- **FOR_TESTERS.md** - For QA team (simple)
- **QUICK_START.md** - Full guide (detailed)
- **README.md** - Overview (quick reference)
- **CHEATSHEET.md** - This file (commands only)

---

**Tip:** Keep this file open while testing.
