#!/bin/bash

echo "🛠️ Starting PristineAudio patches (SAFE HERMES MODE)..."

# ============================================
# 0. HERMES CHECK (NON-BLOCKING)
# ============================================

echo "🧠 Checking Hermes prefab availability..."

HERMES_HEADER=$(find ~/.gradle/caches -name hermes.h 2>/dev/null | head -1)

if [ -z "$HERMES_HEADER" ]; then
  echo "⚠️ Hermes headers not found (this is OK in early build stage)"
  echo "👉 Will continue without Hermes-dependent assumptions"
  SKIP_HERMES=1
else
  echo "📦 Hermes headers found:"
  echo "$HERMES_HEADER"
fi

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
# 2. PATCH WORKLETS (SAFE, IDEMPOTENT)
# ============================================

WORKLETS_CMAKE="node_modules/react-native-worklets/android/CMakeLists.txt"

echo "🔧 Patching Worklets (SAFE)..."

# Only patch if not already patched
grep -q "ReactAndroid::reactnative" "$WORKLETS_CMAKE" || \
  sed -i 's/ReactAndroid::jsctooling/ReactAndroid::jsi ReactAndroid::reactnative/' "$WORKLETS_CMAKE"

echo "✅ Worklets patched safely"

# ============================================
# 3. PATCH WORKLETS GRADLE (SAFE)
# ============================================

WORKLETS_GRADLE="node_modules/react-native-worklets/android/build.gradle"

echo "🔧 Patching Worklets Gradle..."

# Remove duplicate Hermes dep safely
grep -q "hermes-android" "$WORKLETS_GRADLE" && \
  sed -i '/com.facebook.react:hermes-android/d' "$WORKLETS_GRADLE"

echo "✅ Worklets Gradle patched"

# ============================================
# 4. FINAL CHECKS (NO HERMES DEPENDENCY)
# ============================================

echo "🎯 Final sanity check..."

grep -q "ReactAndroid::reactnative" "$WORKLETS_CMAKE" || {
  echo "❌ Worklets linking not properly patched"
  exit 1
}

echo "🎉 All PristineAudio patches applied successfully" 