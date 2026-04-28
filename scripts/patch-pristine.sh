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
# 2. PATCH WORKLETS (SAFE JSC MODE)
# ============================================

WORKLETS_CMAKE="node_modules/react-native-worklets/android/CMakeLists.txt"

echo "🔧 Rewriting Worklets CMake (JSC ONLY, SAFE)..."

cat > "$WORKLETS_CMAKE" << 'EOF'
cmake_minimum_required(VERSION 3.13)

project(worklets)

set(CMAKE_CXX_STANDARD 17)

add_library(worklets SHARED
  cpp/worklets.cpp
)

# React Native dependencies
find_package(ReactAndroid REQUIRED CONFIG)

target_include_directories(worklets PRIVATE
  ${REACT_NATIVE_DIR}/ReactCommon
)

target_link_libraries(worklets
  ReactAndroid::reactnative
  ReactAndroid::jsi
)

EOF

echo "✅ Worklets CMake rewritten (NO HERMES, NO CONDITIONALS)" 