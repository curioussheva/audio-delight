#!/bin/bash
set -e

echo "🛠️ Applying PristineAudio patches (JSC NON-PREFAB MODE)..."

# ============================================
# 1. PATCH RNTP (Oboe Integration)
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
# 2. PATCH WORKLETS (REMOVE HERMES TOTAL)
# ============================================

WORKLETS_CMAKE="node_modules/react-native-worklets/android/CMakeLists.txt"

echo "🔧 Patching Worklets CMake..."

# Hapus hermes-engine
sed -i 's/find_package(hermes-engine REQUIRED)//g' "$WORKLETS_CMAKE"

# Replace linking
sed -i 's/hermes-engine::libhermes/ReactAndroid::jsi/g' "$WORKLETS_CMAKE"

# Fix jsctooling issue
sed -i 's/ReactAndroid::jsctooling/ReactAndroid::jsi ReactAndroid::reactnative/g' "$WORKLETS_CMAKE"

# FORCE JSC
sed -i 's/JS_RUNTIME hermes/JS_RUNTIME jsc/g' "$WORKLETS_CMAKE"

echo "✅ Worklets CMake patched"


# ============================================
# 3. PATCH WORKLETS GRADLE
# ============================================

WORKLETS_GRADLE="node_modules/react-native-worklets/android/build.gradle"

echo "🔧 Patching Worklets Gradle..."

# Remove Hermes dependency
sed -i '/hermes-android/d' "$WORKLETS_GRADLE"

echo "✅ Worklets Gradle patched"


# ============================================
# 4. CLEAN NATIVE CACHE
# ============================================

echo "🧹 Cleaning CMake cache..."

rm -rf node_modules/react-native-worklets/android/.cxx || true


# ============================================
# DONE
# ============================================

echo "🎉 All patches applied (JSC mode)" 