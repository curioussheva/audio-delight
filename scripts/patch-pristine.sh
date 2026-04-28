#!/bin/bash

echo "🛠️ Starting PristineAudio patches (HYBRID HERMES MODE)..."

# ============================================
# 0. HERMES CHECK (SMART)
# ============================================

echo "🧠 Checking Hermes prefab..."

HERMES_CONFIG=$(find ~/.gradle/caches -name "hermes-engineConfig.cmake" 2>/dev/null | head -1)

if [ -z "$HERMES_CONFIG" ]; then
  echo "⚠️ Hermes prefab NOT found → fallback mode"
  USE_HERMES=0
else
  echo "📦 Hermes prefab found:"
  echo "$HERMES_CONFIG"
  USE_HERMES=1
fi

# ============================================
# 1. PATCH RNTP
# ============================================

RNTP_PATH="node_modules/react-native-track-player/android/src/main/java/com/lovegaoshi/kotlinaudio/player"
SRC="scripts/custom-rntp"

echo "🔧 Patching RNTP..."

cp "$SRC/AudioPlayer.kt" "$RNTP_PATH/AudioPlayer.kt"
cp "$SRC/APMRenderersFactory.kt" "$RNTP_PATH/components/APMRenderersFactory.kt"

grep -q "nativeInitEngine" "$RNTP_PATH/AudioPlayer.kt" || exit 1

echo "✅ RNTP patched"

# ============================================
# 2. PATCH WORKLETS
# ============================================

WORKLETS_CMAKE="node_modules/react-native-worklets/android/CMakeLists.txt"

echo "🔧 Patching Worklets..."

# fix jsctooling
sed -i 's/ReactAndroid::jsctooling/ReactAndroid::jsi ReactAndroid::reactnative/' "$WORKLETS_CMAKE"

if [ "$USE_HERMES" -eq 0 ]; then
  echo "⚠️ Applying Hermes fallback patch..."

  sed -i '/find_package(hermes-engine/d' "$WORKLETS_CMAKE"
  sed -i 's/hermes-engine::[a-zA-Z0-9_]*/ReactAndroid::hermes/g' "$WORKLETS_CMAKE"

  echo "✅ Fallback mode applied"
else
  echo "✅ Using REAL Hermes prefab (no patch needed)"
fi

# ============================================
# 3. FINAL CHECK
# ============================================

grep -q "ReactAndroid::reactnative" "$WORKLETS_CMAKE" || {
  echo "❌ Worklets patch failed"
  exit 1
}

echo "🎉 All patches applied successfully"  