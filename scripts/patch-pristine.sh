#!/bin/bash
set -e

echo "🛠️ Applying PristineAudio patches (RNTP Oboe)..."

RNTP_PATH="node_modules/react-native-track-player/android/src/main/java/com/lovegaoshi/kotlinaudio/player"
SRC="scripts/custom-rntp"

echo "🔧 Validating paths..."

[ -d "$RNTP_PATH" ] || { echo "❌ RNTP path not found"; exit 1; }
[ -f "$SRC/AudioPlayer.kt" ] || { echo "❌ Missing AudioPlayer.kt"; exit 1; }
[ -f "$SRC/APMRenderersFactory.kt" ] || { echo "❌ Missing APMRenderersFactory.kt"; exit 1; }

echo "📁 Ensuring components folder..."
mkdir -p "$RNTP_PATH/components"

echo "🔧 Patching RNTP..."

cp -f "$SRC/AudioPlayer.kt" "$RNTP_PATH/AudioPlayer.kt"
cp -f "$SRC/APMRenderersFactory.kt" "$RNTP_PATH/components/APMRenderersFactory.kt"

echo "🔍 Verifying patch..."

grep -q "nativeInitEngine" "$RNTP_PATH/AudioPlayer.kt" || {
  echo "❌ RNTP patch failed"
  exit 1
}

echo "✅ RNTP patched successfully"

