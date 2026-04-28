#!/bin/bash

echo "🛠️ Starting PristineAudio patches (SAFE HERMES MODE)..."

# ============================================
# 0. HERMES CHECK (GRADLE PREFAB)
# ============================================

echo "🧠 Checking Hermes prefab availability..."

HERMES_HEADER=$(find ~/.gradle/caches -path "*hermestooling/include/hermes/hermes.h" 2>/dev/null | head -1)

if [ -z "$HERMES_HEADER" ]; then
  echo "❌ Hermes headers not found in Gradle cache!"
  echo "Expected path: hermestooling/include/hermes/hermes.h"
  echo "👉 Ensure Gradle prefab is resolved before build"
  exit 1
fi

echo "📦 Hermes headers found:"
echo "$HERMES_HEADER"

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
# 2. PATCH WORKLETS (SAFE)
# ============================================

WORKLETS_CMAKE="node_modules/react-native-worklets/android/CMakeLists.txt"

echo "🔧 Patching Worklets (SAFE)..."

# Fix incorrect jsctooling reference
sed -i 's/ReactAndroid::jsctooling/ReactAndroid::jsi ReactAndroid::reactnative/' "$WORKLETS_CMAKE"

echo "✅ Worklets patched safely"

# ============================================
# 3. PATCH WORKLETS GRADLE (MINIMAL)
# ============================================

WORKLETS_GRADLE="node_modules/react-native-worklets/android/build.gradle"

echo "🔧 Patching Worklets Gradle..."

# Remove duplicate Hermes dep if exists (optional safety)
sed -i '/com.facebook.react:hermes-android/d' "$WORKLETS_GRADLE"

echo "✅ Worklets Gradle patched"

# ============================================
# 4. FINAL CHECKS
# ============================================

echo "🎯 Final sanity check..."

grep -q "ReactAndroid::reactnative" "$WORKLETS_CMAKE" || {
  echo "❌ Worklets linking not properly patched"
  exit 1
}

echo "🎉 All PristineAudio patches applied successfully" 