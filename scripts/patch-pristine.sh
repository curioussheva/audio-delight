#!/bin/bash
set -e

echo "🛠️ Applying PristineAudio patches (RNTP Oboe)..."

RNTP_PATH="node_modules/react-native-track-player/android/src/main/java/com/lovegaoshi/kotlinaudio/player"
SRC="scripts/custom-rntp"

echo "🔧 Validating paths..."

[ -d "$RNTP_PATH" ] || { echo "❌ RNTP path not found"; exit 1; }
[ -f "$SRC/AudioPlayer.kt" ] || { echo "❌ Missing AudioPlayer.kt"; exit 1; }
[ -f "$SRC/APMRenderersFactory.kt" ] || { echo "❌ Missing APMRenderersFactory.kt"; exit 1; }
[ -f "$SRC/OboeAudioProcessor.kt" ] || { echo "❌ Missing OboeAudioProcessor.kt"; exit 1; }

echo "📁 Ensuring components + audio folder..."
mkdir -p "$RNTP_PATH/components"
mkdir -p "$RNTP_PATH/audio"

echo "🔧 Patching RNTP..."

cp -f "$SRC/AudioPlayer.kt" "$RNTP_PATH/AudioPlayer.kt"
cp -f "$SRC/APMRenderersFactory.kt" "$RNTP_PATH/components/APMRenderersFactory.kt"

# OboeAudioProcessor HARUS ikut dicopy ke dalam module RNTP. Gradle module
# tidak bisa depend "ke atas" ke app module — RNTP tidak akan pernah bisa
# resolve com.pristineaudio.audio.* kalau class-nya cuma ada di android/app/.
# Package name tetap com.pristineaudio.audio (Kotlin tidak peduli lokasi
# fisik file, asal ada di source set yang di-compile), tapi lokasi fisiknya
# sekarang di dalam node_modules/react-native-track-player.
#
# NativePristineAudio.kt SENGAJA TIDAK ada di sini — sudah dihapus dari
# project (dead code, tidak dipanggil dari jalur AudioPlayer/OboeAudioProcessor
# yang aktif). Kalau nanti butuh lagi, jangan copy balik tanpa cek dulu
# siapa pemanggilnya.
cp -f "$SRC/OboeAudioProcessor.kt" "$RNTP_PATH/audio/OboeAudioProcessor.kt"

echo "🔍 Verifying patch..."

grep -q "nativeInitEngine" "$RNTP_PATH/AudioPlayer.kt" || {
  echo "❌ RNTP patch failed"
  exit 1
}

grep -q "setBypassMode" "$RNTP_PATH/audio/OboeAudioProcessor.kt" || {
  echo "❌ OboeAudioProcessor patch failed (missing setBypassMode)"
  exit 1
}

echo "✅ RNTP patched successfully"
 