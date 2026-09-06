#!/bin/bash
set -e

adb wait-for-device
adb logcat -c

# Start logcat streaming
adb logcat -v time -s FFmpegDecoder:V PlaybackController:V AudioCallback:V NativePlaybackModule:V > /tmp/audio.log 2>&1 &
LOGCAT_PID=$!

# Install APK
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Download & push test MP3 (dengan fallback)
adb shell mkdir -p /sdcard/Music
echo "⬇️ Downloading test MP3..."
curl -L -o /tmp/test.mp3 "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" || echo "Download failed, using fallback..."
if [ ! -f /tmp/test.mp3 ]; then
  curl -L -o /tmp/test.mp3 "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
fi

if [ -f /tmp/test.mp3 ]; then
  adb push /tmp/test.mp3 /sdcard/Music/test.mp3
  echo "✅ Test MP3 pushed to /sdcard/Music/test.mp3"
  adb shell ls -l /sdcard/Music/test.mp3
else
  echo "❌ Failed to download test MP3, creating dummy file"
  adb shell dd if=/dev/zero of=/sdcard/Music/test.mp3 bs=1M count=1
fi

# Launch MainActivity
adb shell am start -n com.pristineaudio.app/.MainActivity

# Tunggu sebentar agar activity terbuka
sleep 3

# Cek apakah MainActivity terbuka
if adb logcat -d | grep -q "MainActivity"; then
  echo "✅ MainActivity started"
else
  echo "⚠️ MainActivity not detected in logs"
fi

# Cek JNI_OnLoad
if adb logcat -d -s PristineJNI:I | grep -q "JNI_OnLoad called"; then
  echo "✅ JNI_OnLoad terdeteksi!"
else
  echo "⚠️ JNI_OnLoad tidak terdeteksi dalam 3 detik pertama"
fi

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

# Print summaries
echo "=== UnsatisfiedLinkError ==="
grep -B 5 -A 20 "UnsatisfiedLinkError" logcat-full.log || echo "No UnsatisfiedLinkError"

echo "=== Fatal / Crash ==="
grep -B 5 -A 20 "FATAL" logcat-full.log || echo "No FATAL errors"

echo "=== Decoder errors ==="
grep -B 5 -A 20 "FFmpeg\|Decoder" logcat-full.log | head -100 || echo "No decoder errors"

echo "=== JNI_OnLoad / EngineManager init ==="
grep -B 2 -A 5 "PristineJNI\|EngineManager" logcat-full.log || echo "No JNI_OnLoad or EngineManager logs found"

echo "=== PlaybackController logs ==="
grep -B 2 -A 5 "PlaybackController" logcat-full.log || echo "No PlaybackController logs found" 