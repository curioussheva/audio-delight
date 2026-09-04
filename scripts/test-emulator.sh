#!/bin/bash
set -e

adb wait-for-device
adb logcat -c

# Start logcat streaming in background
adb logcat -v time -s FFmpegDecoder:V PlaybackController:V AudioCallback:V NativePlaybackModule:V > /tmp/audio.log 2>&1 &
LOGCAT_PID=$!

# Install APK
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Download & push test MP3
adb shell mkdir -p /sdcard/Music
echo "⬇️ Downloading test MP3..."
curl -L -o /tmp/test.mp3 "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"

if [ -f /tmp/test.mp3 ]; then
  adb push /tmp/test.mp3 /sdcard/Music/test.mp3
  echo "✅ Test MP3 pushed to /sdcard/Music/test.mp3"
  adb shell ls -l /sdcard/Music/test.mp3
else
  echo "❌ Failed to download test MP3"
  exit 1
fi

# Launch MainActivity
adb shell am start -n com.pristineaudio.app/.MainActivity

# Wait for PlaybackController init
echo "⏳ Waiting for PlaybackController initialize..."
timeout 60 adb logcat -s PlaybackController:I -m 1 || echo "⚠️ PlaybackController not initialized in time"

# Let audio play for 45 seconds
echo "⏳ Sleeping 45s to capture playback logs..."
sleep 45

# Stop logcat
kill $LOGCAT_PID || true

# Save logs
cat /tmp/audio.log > audio-debug.log
adb logcat -d -v time > logcat-full.log

# Print errors
echo "=== UnsatisfiedLinkError ==="
grep -B 5 -A 20 "UnsatisfiedLinkError" logcat-full.log || echo "No UnsatisfiedLinkError"
echo "=== Fatal / Crash ==="
grep -B 5 -A 20 "FATAL" logcat-full.log || echo "No FATAL errors"
echo "=== Decoder errors ==="
grep -B 5 -A 20 "FFmpeg\|Decoder" logcat-full.log | head -100 || echo "No decoder errors"