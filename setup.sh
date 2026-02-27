#!/bin/bash
# ============================================================
# AudioDelight — Setup Script (fix track-player included)
# ============================================================
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "\n${BLUE}🎧 AudioDelight Setup${NC}\n=====================\n"

# 1. Node check
node -e "if(parseInt(process.version.slice(1))<18){console.error('Need Node 18+');process.exit(1)}"
echo -e "${GREEN}✅ Node: $(node --version)${NC}"

# 2. Yarn
command -v yarn &>/dev/null || npm install -g yarn
echo -e "${GREEN}✅ Yarn: $(yarn --version)${NC}"

# 3. Clean install
echo -e "\n📦 Installing dependencies..."
rm -rf node_modules yarn.lock
yarn install

# 4. Fix react-native-track-player ← INI YANG PENTING
echo -e "\n${YELLOW}🔧 Fixing react-native-track-player...${NC}"
RNTP_LIB="node_modules/react-native-track-player/lib/src"
TARGET="$RNTP_LIB/trackPlayer.js"
mkdir -p "$RNTP_LIB"

if [ ! -f "$TARGET" ]; then
  echo "   Menjalankan fix script..."
  node scripts/fix-track-player.js
  echo -e "${GREEN}   ✅ Fix applied${NC}"
else
  echo -e "${GREEN}   ✅ trackPlayer.js sudah ada${NC}"
fi

# 5. Install EAS CLI
command -v eas &>/dev/null || npm install -g eas-cli
echo -e "${GREEN}✅ EAS CLI ready${NC}"

echo -e "\n${GREEN}✅ Setup complete!${NC}"
echo -e "\nCommands:\n  yarn android        → Run on device\n  yarn start          → Start dev server\n  eas build ...       → Build APK\n"
echo -e "${YELLOW}⚠️  Test audio di device FISIK (bukan emulator)${NC}\n"
