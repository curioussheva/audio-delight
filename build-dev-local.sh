#!/bin/bash

# ============================================
# PristineAudio - Local Development Build
# ============================================

echo -e "\033[1;34m================================\033[0m"
echo -e "\033[1;32m🚀 Local Development Build\033[0m"
echo -e "\033[1;34m================================\033[0m"

# Prebuild dulu
echo -e "\033[1;33m📦 Prebuilding...\033[0m"
npx expo prebuild --clean

# Build lokal dengan EAS
eas build \
  --platform android \
  --profile development \
  --local \
  --clear-cache \
  --non-interactive \
  --output ./build/app-release.apk

if [ $? -eq 0 ]; then
    echo -e "\033[1;32m✅ Local build successful!\033[0m"
    echo -e "\033[1;36m📱 APK location: ./build/app-release.apk\033[0m"
else
    echo -e "\033[1;31m❌ Local build failed\033[0m"
fi