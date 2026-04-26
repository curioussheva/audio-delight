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

# ============================================
# 3. Patch Worklets (remove hermes-android Maven dep)
# ============================================
WORKLETS_GRADLE="node_modules/react-native-worklets/android/build.gradle"

echo "🔧 Patching Worklets build.gradle..."
sed -i '/implementation "com.facebook.react:hermes-android"/d' "$WORKLETS_GRADLE"

grep -q "hermes-android" "$WORKLETS_GRADLE" && { echo "❌ Worklets gradle patch failed: hermes-android still present"; exit 1; }

echo "✅ Worklets build.gradle patched successfully"

# ============================================
# 4. Patch expo-dev-client (remove hermes-android Maven dep)
# ============================================
DEV_CLIENT_GRADLE="node_modules/expo-dev-client/android/build.gradle"

echo "🔧 Patching expo-dev-client build.gradle..."
sed -i '/androidTestImplementation .com.facebook.react:hermes-android./d' "$DEV_CLIENT_GRADLE"

grep -q "hermes-android" "$DEV_CLIENT_GRADLE" && { echo "❌ expo-dev-client gradle patch failed"; exit 1; }

echo "✅ expo-dev-client build.gradle patched successfully"

# ============================================
# 5. Patch expo-modules-core (remove hermes-android Maven dep)
# ============================================
MODULES_CORE_GRADLE="node_modules/expo-modules-core/android/build.gradle"

echo "🔧 Patching expo-modules-core build.gradle..."
sed -i '/compileOnly "com.facebook.react:hermes-android"/d' "$MODULES_CORE_GRADLE"

grep -q "hermes-android" "$MODULES_CORE_GRADLE" && { echo "❌ expo-modules-core gradle patch failed"; exit 1; }

echo "✅ expo-modules-core build.gradle patched successfully"

echo "🎉 All PristineAudio patches applied"

