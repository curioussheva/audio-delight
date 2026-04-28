#!/bin/bash

echo "🛠️ Starting PristineAudio patches (STABLE MODE)..."

# ============================================
# 1. PATCH RNTP
# ============================================

RNTP_PATH="node_modules/react-native-track-player/android/src/main/java/com/lovegaoshi/kotlinaudio/player"
SRC="scripts/custom-rntp"

echo "🔧 Patching RNTP..."

cp "$SRC/AudioPlayer.kt" "$RNTP_PATH/AudioPlayer.kt"
cp "$SRC/APMRenderersFactory.kt" "$RNTP_PATH/components/APMRenderersFactory.kt"

grep -q "nativeInitEngine" "$RNTP_PATH/AudioPlayer.kt" || {
  echo "❌ RNTP patch failed"
  exit 1
}

echo "✅ RNTP patched"

# ============================================
# 2. PATCH WORKLETS (ONLY SAFE FIX)
# ============================================

WORKLETS_CMAKE="node_modules/react-native-worklets/android/CMakeLists.txt"

echo "🔧 Patching Worklets..."

# Fix jsctooling only
sed -i 's/ReactAndroid::jsctooling/ReactAndroid::jsi ReactAndroid::reactnative/' "$WORKLETS_CMAKE"

echo "✅ Worklets patched"

# ============================================
# 3. PATCH GRADLE
# ============================================

WORKLETS_GRADLE="node_modules/react-native-worklets/android/build.gradle"

echo "🔧 Cleaning duplicate Hermes deps..."

sed -i '/com.facebook.react:hermes-android/d' "$WORKLETS_GRADLE"

echo "✅ Gradle cleaned"

# ============================================
# DONE
# ============================================

echo "🎉 All patches applied successfully" 