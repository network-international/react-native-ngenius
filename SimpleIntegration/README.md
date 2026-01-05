# N-Genius React Native SDK - Demo Application

This is a demo/test application for the N-Genius Payment SDK React Native integration with Google Pay support.

## Quick Start

**For testers:** Use the one-line command to launch the Android app.

### Android (Google Pay Integration)
```bash
./start-android.sh
```

This script will automatically:
- Start the Android emulator
- Start Metro bundler
- Build and install the app
- Launch the application

## Full Documentation

See **[QUICK_START.md](./QUICK_START.md)** for:
- Detailed prerequisites
- Troubleshooting guide
- Manual setup instructions
- Testing instructions
- Screenshot/video capture instructions

## Test Credentials

The app is pre-configured with test credentials:
- **API Key:** `MjBkZWYwZGYtYjJlYS00MzdhLWIyNjAtNjU2NDE1ODhlZDY0Ojc2ZTA0N2I2LTg5NGMtNDBmOS04NTQwLWUzYTUxNmY0MjQ2MA==`
- **Outlet ID:** `7a25a4a6-d7a8-43e3-af16-e190ce2b0f10`
- **Merchant ID:** `2078478434`

## Project Structure

```
SimpleIntegration/
├── src/
│   ├── app.js              # Main application component
│   ├── ngenius-apis.js     # API integration & credentials
│   └── save-card-frame.js  # Card saving functionality
├── android/                # Android native code
├── start-android.sh        # Android quick start script
├── QUICK_START.md          # Detailed guide
└── README.md               # This file
```

## Development

### Install Dependencies
```bash
npm install
```

### Start Metro Bundler
```bash
npm start
```

### Run on Android
```bash
npm run android
```

## Features

This demo app demonstrates:
- Card payment integration
- Google Pay integration (Android only)
- Save card functionality
- Payment processing flow

## Troubleshooting

### Quick fixes:

**Metro bundler issues:**
```bash
killall node
npm start -- --reset-cache
```

**Build issues:**
```bash
cd android && ./gradlew clean && cd ..
```

**Port conflicts:**
```bash
lsof -ti:8081 | xargs kill -9
```

For more troubleshooting, see [QUICK_START.md](./QUICK_START.md).

## Support

If you encounter issues:
1. Check [QUICK_START.md](./QUICK_START.md) troubleshooting section
2. Verify all prerequisites are installed
3. Check Metro bundler logs: `/tmp/metro-android.log`

---

**SDK Version:** See `package.json`  
**Last Updated:** January 2026
