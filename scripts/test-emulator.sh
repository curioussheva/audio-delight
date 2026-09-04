#!/usr/bin/env bash
set -e

adb wait-for-device
adb logcat -c

# Stream logcat di background Host Runner
adb logcat -v time -s FFmpegDecoder:V PlaybackController:V AudioCallback:V NativePlaybackModule:V > /tmp/audio.log 2>&1 &
LOGCAT_PID=$!

# Install APK dari Host ke Emulator
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Download MP3 di Host VM, lalu push ke internal storage Emulator
adb shell mkdir -p /sdcard/Music
echo "⬇️ Downloading test MP3 on Runner Host..."
curl -L -o /tmp/test.mp3 "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"

if [ -f /tmp/test.mp3 ]; then
  adb push /tmp/test.mp3 /sdcard/Music/test.mp3
  echo "✅ Test MP3 pushed to /sdcard/Music/test.mp3"
  adb shell ls -l /sdcard/Music/test.mp3
else
  echo "❌ Failed to download test MP3 on Host"
  exit 1
fi

# Launch App
adb shell am start -n com.pristineaudio.app/.MainActivity

echo "⏳ Waiting for PlaybackController initialize..."
timeout 60 adb logcat -s PlaybackController:I -m 1 || echo "⚠️ PlaybackController not initialized in time"

echo "⏳ Sleeping 45s to capture playback logs..."
sleep 45

kill $LOGCAT_PID || true

# Dump log
cat /tmp/audio.log > audio-debug.log
adb logcat -d -v time > logcat-full.log

echo "=== UnsatisfiedLinkError ==="
grep -B 5 -A 20 "UnsatisfiedLinkError" logcat-full.log || echo "No UnsatisfiedLinkError"
echo "=== Fatal / Crash ==="
grep -B 5 -A 20 "FATAL" logcat-full.log || echo "No FATAL errors"
echo "=== Decoder errors ==="
grep -B 5 -A 20 "FFmpeg\|Decoder" logcat-full.log | head -100 || echo "No decoder errors"
