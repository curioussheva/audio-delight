#!/usr/bin/env bash
export ANDROID_SDK_HOME="${ANDROID_SDK_HOME:-$HOME/Android/Sdk}"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_SDK_HOME/ndk/27.1.12297006}"

set -euo pipefail

# ============================================
# Script: Build FFmpeg untuk Android
# Menggunakan ffmpeg-android-maker
# ============================================

# Versi FFmpeg (bisa disesuaikan)
FFMPEG_VERSION="6.1.2"

# Arsitektur target
ARCHS=("arm64-v8a" "armeabi-v7a" "x86" "x86_64")

# Android NDK version (sesuaikan dengan NDK yang terpasang)
NDK_VERSION="27.1.12297006"

# API level minimum
MIN_API=24

# Output base
OUTPUT_BASE="android/app/src/main/cpp/libs/ffmpeg"

# Buat direktori kerja
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

# Download FFmpeg source
FFMPEG_TARBALL="ffmpeg-${FFMPEG_VERSION}.tar.xz"
FFMPEG_URL="https://ffmpeg.org/releases/${FFMPEG_TARBALL}"

if [ ! -f "$WORK_DIR/$FFMPEG_TARBALL" ]; then
    echo "⬇️  Downloading FFmpeg source ${FFMPEG_VERSION}..."
    curl -L -o "$WORK_DIR/$FFMPEG_TARBALL" "$FFMPEG_URL"
fi

# Ekstrak source
if [ ! -d "$WORK_DIR/ffmpeg-${FFMPEG_VERSION}" ]; then
    echo "📦 Extracting FFmpeg source..."
    tar -xf "$WORK_DIR/$FFMPEG_TARBALL" -C "$WORK_DIR"
fi

# Build untuk setiap arsitektur
for ARCH in "${ARCHS[@]}"; do
    echo "🔨 Building FFmpeg for $ARCH..."

    # Set toolchain
    case $ARCH in
        arm64-v8a)
            TOOLCHAIN="aarch64-linux-android"
            ;;
        armeabi-v7a)
            TOOLCHAIN="armv7a-linux-androideabi"
            ;;
        x86)
            TOOLCHAIN="i686-linux-android"
            ;;
        x86_64)
            TOOLCHAIN="x86_64-linux-android"
            ;;
    esac

    # Tentukan folder output
    DEST="$OUTPUT_BASE/$ARCH"
    mkdir -p "$DEST"

    # Jalankan build menggunakan ffmpeg-android-maker
    cd "$WORK_DIR/ffmpeg-android-maker"

    ./ffmpeg-android-maker.sh \
        --ffmpeg-version "$FFMPEG_VERSION" \
        --arch "$ARCH" \
        --android-api-level "$MIN_API" \
        --toolchain "$TOOLCHAIN" \
        --output-dir "$DEST"

    cd -
done

echo ""
echo "🎉 FFmpeg Android build selesai!"
echo "Output folder: $OUTPUT_BASE"