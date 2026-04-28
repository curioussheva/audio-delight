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

echo "🔧 Hard patching Worklets CMake (FULL STRIP HERMES)..."

# 1. Hapus semua referensi hermes-engine
sed -i '/hermes-engine/d' "$WORKLETS_CMAKE"

# 2. Hapus blok find_package hermes
sed -i '/find_package(hermes-engine/d' "$WORKLETS_CMAKE"

# 3. Replace linking hermes → jsi
sed -i 's/hermes-engine::libhermes/ReactAndroid::jsi/g' "$WORKLETS_CMAKE"

# 4. Fix jsctooling
sed -i 's/ReactAndroid::jsctooling/ReactAndroid::jsi ReactAndroid::reactnative/g' "$WORKLETS_CMAKE"

# 5. FORCE runtime ke JSC (semua kemungkinan format)
sed -i 's/JS_RUNTIME hermes/JS_RUNTIME jsc/g' "$WORKLETS_CMAKE"
sed -i 's/JS_RUNTIME=hermes/JS_RUNTIME=jsc/g' "$WORKLETS_CMAKE"

# 6. Extra safety: hapus conditional hermes block
sed -i '/JS_RUNTIME.*hermes/d' "$WORKLETS_CMAKE"

echo "✅ Worklets fully de-hermes-ed"

echo "🔍 Checking for leftover hermes references..."
grep -n "hermes" "$WORKLETS_CMAKE" || echo "✅ No hermes references left"