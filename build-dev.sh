#!/bin/bash

# ============================================
# PristineAudio - Development Build Script
# ============================================

# Warna untuk output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}🚀 PristineAudio Development Build${NC}"
echo -e "${BLUE}================================${NC}"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo -e "${GREEN}✅ Environment loaded${NC}"
else
    echo -e "${YELLOW}⚠️  .env file not found, using defaults${NC}"
fi

# Cek EAS CLI
if ! command -v eas &> /dev/null; then
    echo -e "${RED}❌ EAS CLI not found. Installing...${NC}"
    npm install -g eas-cli
fi

# Cek login status
echo -e "${BLUE}📋 Checking EAS login status...${NC}"
eas whoami || eas login

# Verifikasi project ID
PROJECT_ID=$(grep -o '"projectId": *"[^"]*"' app.json | cut -d'"' -f4)
echo -e "${BLUE}📋 Project ID: ${PROJECT_ID}${NC}"

# ============================================
# EAS Build dengan parameter penting
# ============================================

# Parameter yang sering digunakan:
# --no-wait              : Tidak menunggu build selesai
# --auto-submit          : Submit otomatis setelah build
# --local                : Build lokal (bukan di cloud)
# --profile <name>       : Profile dari eas.json
# --platform <platform>  : android / ios / all
# --non-interactive      : Mode non-interactive (untuk CI/CD)
# --clear-cache          : Bersihkan cache sebelum build
# --json                 : Output dalam format JSON

echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}🏗️  Starting EAS Development Build...${NC}"
echo -e "${BLUE}================================${NC}"

# Development build untuk Android
eas build \
  --platform android \
  --profile development \
  --clear-cache \
  --no-wait \
  --non-interactive \
  --json \
  2>&1 | tee build-log.txt

# Cek hasil build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build triggered successfully!${NC}"
    echo -e "${BLUE}📱 Check build progress:${NC}"
    echo -e "   https://expo.dev/accounts/curioussheva/projects/pristine-audio/builds"
else
    echo -e "${RED}❌ Build failed. Check build-log.txt${NC}"
    exit 1
fi

# ============================================
# Opsi tambahan untuk fingerprint
# ============================================

# Jika ada masalah fingerprint, uncomment baris berikut:
# export EAS_NO_VCS=1
# export EAS_NO_FINGERPRINT=1
# eas build --platform android --profile development --no-wait --clear-cache --non-interactive

echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}✨ Build script completed!${NC}"
echo -e "${BLUE}================================${NC}"