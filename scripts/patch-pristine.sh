#!/bin/bash

echo "🛠️ Starting PristineAudio patches (SAFE HERMES MODE)..."

# ============================================
# 0. HERMES FIX LAYER (CRITICAL FOR CI)
# ============================================

echo "🧠 Configuring Hermes environment..."

# Try multiple possible NDK Hermes locations (CI-safe)
HERMES_DIR_1="$ANDROID_HOME/ndk/27.1.12297006/sources/third_party/hermes"
HERMES_DIR_2="$ANDROID_NDK_HOME/sources/third_party/hermes"

HERMES_DIR=""

if [ -d "$HERMES_DIR_1" ]; then
  HERMES_DIR="$HERMES_DIR_1"
elif [ -d "$HERMES_DIR_2" ]; then
  HERMES_DIR="$HERMES_DIR_2"
fi

if [ -z "$HERMES_DIR" ]; then
  echo "❌ Hermes source not found in NDK!"
  echo "Expected in:"
  echo " - $HERMES_DIR_1"
  echo " - $HERMES_DIR_2"
  exit 1
fi

echo "📦 Hermes found at: $HERMES_DIR"

echo "HERMES_DIR=$HERMES_DIR" >> $GITHUB_ENV
echo "CPLUS_INCLUDE_PATH=$HERMES_DIR/Public:$CPLUS_INCLUDE_PATH" >> $GITHUB_ENV
echo "C_INCLUDE_PATH=$HERMES_DIR/Public:$C_INCLUDE_PATH" >> $GITHUB_ENV

# ============================================
# 1. PATCH RNTP (Oboe Integration)
# ============================================

RNTP_PATH="node_modules/react-native-track-player/android/src/main/java/com/lovegaoshi/kotlinaudio/player"
SRC="scripts/custom-rntp"

echo "🔧 Patching RNTP..."

cp "$SRC/AudioPlayer.kt" "$RNTP_PATH/AudioPlayer.kt"
cp "$SRC/APMRenderersFactory.kt" "$RNTP_PATH/components/APMRenderersFactory.kt"

grep -q "nativeInitEngine" "$RNTP_PATH/AudioPlayer.kt" || {
  echo "❌ RNTP patch failed: nativeInitEngine missing"
  exit 1
}

grep -q "enableAudioOffload" "$RNTP_PATH/components/APMRenderersFactory.kt" && {
  echo "❌ RNTP patch failed: enableAudioOffload still present"
  exit 1
}

echo "✅ RNTP patched successfully"

# ============================================
# 2. PATCH WORKLETS (SAFE MODE - NO HERMES REMOVAL)
# ============================================

WORKLETS_CMAKE="node_modules/react-native-worklets/android/CMakeLists.txt"

echo "🔧 Patching Worklets (SAFE MODE)..."

# ONLY fix incorrect ReactAndroid linking
sed -i 's/ReactAndroid::jsctooling/ReactAndroid::jsi ReactAndroid::reactnative/' "$WORKLETS_CMAKE"

# DO NOT remove:
# - hermes-engine
# - hermesvm
# - libhermes
# because Worklets NEED them for C++ Hermes runtime

echo "✅ Worklets patched safely"

# ============================================
# 3. PATCH WORKLETS GRADLE (SAFE)
# ============================================

WORKLETS_GRADLE="node_modules/react-native-worklets/android/build.gradle"

echo "🔧 Patching Worklets Gradle..."

# Only remove explicit Maven dependency if exists (optional, safe)
sed -i '/com.facebook.react:hermes-android/d' "$WORKLETS_GRADLE"

echo "✅ Worklets Gradle patched"

# ============================================
# 4. PATCH RNTP VALIDATION CHECK
# ============================================

echo "🔍 Validating Hermes headers..."

if [ ! -f "$HERMES_DIR/Public/hermes/hermes.h" ]; then
  echo "❌ hermes.h NOT FOUND"
  echo "CI environment missing Hermes headers"
  exit 1
fi

echo "✅ Hermes headers OK"

# ============================================
# 5. FINAL CHECKS
# ============================================

echo "🎯 Final sanity check..."

grep -q "hermes/hermes.h" "$WORKLETS_CMAKE" || {
  echo "⚠️ Warning: Worklets may not include Hermes headers"
}

echo "🎉 All PristineAudio patches applied successfully" 