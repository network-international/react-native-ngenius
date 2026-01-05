#!/bin/bash
# Quick start script for Android
# Usage: ./start-android.sh [emulator_name]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Android application...${NC}\n"

# Set Android SDK paths
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools

# Default emulator name (can be overridden with first argument)
EMULATOR_NAME="${1:-Pixel_5_API_35}"

# Step 1: Check/Start Emulator
echo -e "${BLUE}📱 Step 1/4: Checking Android emulator...${NC}"
if adb devices | grep -q "emulator"; then
  echo -e "${GREEN}✅ Emulator is already running${NC}"
else
  echo -e "${YELLOW}⏳ Starting emulator: $EMULATOR_NAME${NC}"
  emulator -avd "$EMULATOR_NAME" -no-snapshot-load > /dev/null 2>&1 &
  
  echo -e "${YELLOW}⏳ Waiting for emulator to boot...${NC}"
  adb wait-for-device
  
  # Wait for boot to complete
  while ! adb shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; do
    sleep 2
  done
  echo -e "${GREEN}✅ Emulator is ready!${NC}"
fi

# Step 2: Set up port forwarding
echo -e "\n${BLUE}🔗 Step 2/4: Setting up port forwarding...${NC}"
adb reverse tcp:8081 tcp:8081
echo -e "${GREEN}✅ Port forwarding configured${NC}"

# Step 3: Check/Start Metro bundler
echo -e "\n${BLUE}📦 Step 3/4: Checking Metro bundler...${NC}"
if curl -s http://localhost:8081/status > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Metro bundler is already running${NC}"
else
  echo -e "${YELLOW}⏳ Starting Metro bundler...${NC}"
  
  # Start Metro in background
  npm start > /tmp/metro-android.log 2>&1 &
  METRO_PID=$!
  
  # Wait for Metro to be ready (max 60 seconds)
  for i in {1..60}; do
    if curl -s http://localhost:8081/status > /dev/null 2>&1; then
      echo -e "${GREEN}✅ Metro bundler is ready!${NC}"
      break
    fi
    sleep 1
  done
  
  if ! curl -s http://localhost:8081/status > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Metro might not be fully ready, but continuing...${NC}"
  fi
fi

# Step 4: Build and install app
echo -e "\n${BLUE}🏗️  Step 4/4: Building and installing app...${NC}"
npm run android

echo -e "\n${GREEN}✅ Done! The app should open on your emulator.${NC}"
echo -e "${BLUE}💡 Tip: If you see a red error screen, press 'R' twice to reload.${NC}"

