#!/usr/bin/env bash

set -euo pipefail

# ============================================
# Script: Build FFmpeg untuk Android
# Menggunakan ffmpeg-android-maker
# ============================================

# Versi FFmpeg (bisa disesuaikan)
FFMPEG_VERSION="6.1.2"

# Arsitektur target
ARCHS=("arm64-v8a" "armeabi-v7a" "x86" "x86_64")

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
        echo "❌ Missing output for $ARCH:"
        echo "  include: $SRC_INCLUDE"
        echo "  lib: $SRC_LIB"
        exit 1
    fi
done

echo ""
echo "🎉 FFmpeg Android build selesai!"
echo "Output folder: $OUTPUT_BASE" 