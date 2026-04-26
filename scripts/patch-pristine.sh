#!/bin/bash

echo "🛠️ Starting PristineAudio patches..."

# ============================================
# 1. Patch RNTP (Oboe Integration)
# ============================================
RNTP_PATH="node_modules/react-native-track-player/android/src/main/java/com/lovegaoshi/kotlinaudio/player"
SRC="scripts/custom-rntp"

echo "🔧 Patching RNTP..."
cp "$SRC/AudioPlayer.kt" "$RNTP_PATH/AudioPlayer.kt"
cp "$SRC/APMRenderersFactory.kt" "$RNTP_PATH/components/APMRenderersFactory.kt"

grep -q "nativeInitEngine" "$RNTP_PATH/AudioPlayer.kt" || { echo "❌ RNTP patch failed: nativeInitEngine missing"; exit 1; }
grep -q "enableAudioOffload" "$RNTP_PATH/components/APMRenderersFactory.kt" && { echo "❌ RNTP patch failed: enableAudioOffload still present"; exit 1; }

echo "✅ RNTP patched successfully"

# ============================================
# 2. Patch Worklets (CMakeLists fix)
# ============================================
WORKLETS_CMAKE="node_modules/react-native-worklets/android/CMakeLists.txt"

echo "🔧 Patching Worklets..."
sed -i 's/ReactAndroid::jsctooling/ReactAndroid::jsi ReactAndroid::reactnative/' "$WORKLETS_CMAKE"

grep -q "ReactAndroid::jsi ReactAndroid::reactnative" "$WORKLETS_CMAKE" || { echo "❌ Worklets patch failed"; exit 1; }

echo "✅ Worklets patched successfully"

echo "🎉 All PristineAudio patches applied"