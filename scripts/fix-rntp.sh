#!/bin/bash

# Path tujuan di dalam node_modules
BASE_PATH="node_modules/react-native-track-player/android/src/main/java/com/lovegaoshi/kotlinaudio/player"

echo "🛠️ Injecting Pristine Audio (Oboe) into RNTP..."

# Timpa AudioPlayer.kt
cp scripts/custom-rntp/AudioPlayer.kt "$BASE_PATH/AudioPlayer.kt"

# Timpa APMRenderersFactory.kt
cp scripts/custom-rntp/APMRenderersFactory.kt "$BASE_PATH/components/APMRenderersFactory.kt"

echo "✅ RNTP has been manually patched for Oboe integration."
