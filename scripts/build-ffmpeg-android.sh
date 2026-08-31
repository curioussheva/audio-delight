#!/usr/bin/env bash

set -euo pipefail

# ============================================
# Tentukan Android SDK & NDK
# ============================================
if [ -z "${ANDROID_SDK_HOME:-}" ]; then
    if [ -n "${ANDROID_HOME:-}" ]; then
        export ANDROID_SDK_HOME="$ANDROID_HOME"
    elif [ -n "${ANDROID_SDK_ROOT:-}" ]; then
        export ANDROID_SDK_HOME="$ANDROID_SDK_ROOT"
    else
        echo "❌ ANDROID_SDK_HOME is not defined. Exiting."
        exit 1
    fi
fi

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
    # Cari NDK di dalam SDK
    NDK_DIR=$(find "$ANDROID_SDK_HOME/ndk" -maxdepth 1 -type d -name "27.1.12297006" 2>/dev/null | head -1)
    if [ -n "$NDK_DIR" ]; then
        export ANDROID_NDK_HOME="$NDK_DIR"
    else
        echo "❌ NDK 27.1.12297006 not found in $ANDROID_SDK_HOME/ndk. Exiting."
        exit 1
    fi
fi

echo "Using ANDROID_SDK_HOME=$ANDROID_SDK_HOME"
echo "Using ANDROID_NDK_HOME=$ANDROID_NDK_HOME"

# ============================================
# Script: Build FFmpeg untuk Android
# Menggunakan ffmpeg-android-maker
# ============================================

FFMPEG_VERSION="6.1.2"
ARCHS=("arm64-v8a" "armeabi-v7a" "x86" "x86_64")
MIN_API=24
OUTPUT_BASE="android/app/src/main/cpp/libs/ffmpeg"
WORK_DIR="./tmp/ffmpeg-build"

mkdir -p "$WORK_DIR" "$OUTPUT_BASE"

# Clone ffmpeg-android-maker
if [ ! -d "$WORK_DIR/ffmpeg-android-maker" ]; then
    echo "⬇️  Cloning ffmpeg-android-maker..."
    git clone https://github.com/Javernaut/ffmpeg-android-maker.git "$WORK_DIR/ffmpeg-android-maker"
else
    echo "✅ ffmpeg-android-maker already cloned"
    cd "$WORK_DIR/ffmpeg-android-maker"
    git pull
    cd -
fi

# Jalankan build untuk semua arsitektur sekaligus
cd "$WORK_DIR/ffmpeg-android-maker"

echo "🔨 Building FFmpeg for ABIs: ${ARCHS[*]}..."

./ffmpeg-android-maker.sh \
    --target-abis="$(IFS=,; echo "${ARCHS[*]}")" \
    --source-tar="$FFMPEG_VERSION" \
    --android-api-level="$MIN_API"

cd -

# Salin hasil build ke output base
echo "📦 Copying FFmpeg outputs..."
for ARCH in "${ARCHS[@]}"; do
    SRC_INCLUDE="$WORK_DIR/ffmpeg-android-maker/output/include/$ARCH"
    SRC_LIB="$WORK_DIR/ffmpeg-android-maker/output/lib/$ARCH"

    DEST="$OUTPUT_BASE/$ARCH"
    mkdir -p "$DEST"

    if [ -d "$SRC_INCLUDE" ] && [ -d "$SRC_LIB" ]; then
        cp -R "$SRC_INCLUDE" "$DEST/"
        cp -R "$SRC_LIB" "$DEST/"
        echo "✅ FFmpeg for $ARCH copied to $DEST"
    else
        echo "❌ Missing output for $ARCH"
        exit 1
    fi
done

echo ""
echo "🎉 FFmpeg Android build selesai!" 